/**
 * NG-387 (NG-202 B3) — the orphaned credit reservation sweep: the `ai-reservation-orphans` job
 * (src/lib/jobs/tasks/ai-reservation-orphans.ts) runs this every 15 minutes.
 *
 * An M18 action reserves its price before the model call, as one `usage:M18` CreditLedger row
 * (src/modules/m18/server/ai-credits.ts, refId `M18:<purpose>:<uuid>`), and gives it back as
 * `refund:M18` when it delivers nothing. Both run in their own transactions: a process that dies
 * between them (deploy, crash, platform timeout) leaves the debit standing with no refund and no
 * `llm-refund` alert, and the tenant's credit is gone without a trace.
 *
 * A delivered action writes no refund either — its reservation IS the charge — so "no refund"
 * alone would refund every delivered action. The delivery marker is `AiUsageLog.refId`:
 * generateCompletion writes the reservation's refId into the usage row of a complete answer
 * (`reservationRefId`). An orphan is therefore a `usage:<module>` debit, refId `<module>:…`, that
 *   • is older than `olderThanMinutes` (RESERVATION_ORPHAN_MINUTES, default 60: longer than any
 *     M18 action), so a running action is not touched;
 *   • has no `refund:<module>` row and no AiUsageLog row with the same tenant and refId;
 *   • is not older than the module's FIRST delivery marker. Rows reserved before the marker
 *     existed (before NG-387 shipped) carry no marker even when delivered; nothing can tell a
 *     delivered one from an orphan, so they are left alone. Until the first marker of a module
 *     exists, nothing of that module is refunded.
 *
 * Only M18. M17 runs have their own sweeper (m17-stale-runs, FO-317) keyed on the analysis row:
 * an M17 run never writes a marker (its refId is `runRef(id, claim)`), so this sweep must never
 * see `usage:M17` — it would refund every delivered M17 run. ORPHAN_SWEEP_MODULES is the list.
 *
 * Each refund is releaseAiReservation under the tenant credit lock: the one refund path, no second
 * credit formula (CLAUDE.md rule 5), idempotent. Candidates are read again under the locks, so a
 * refund that committed meanwhile (the action's own, or a second sweep) is not repeated; two
 * sweeps at once refund once. Paged like stale-runs.ts: one transaction per BATCH rows, at most
 * MAX_BATCHES per run, the rest reported as `more`.
 */
import { Prisma } from '@prisma/client';

import { lockTenantCredits, releaseAiReservation } from '@/lib/llm';
import { withSystemScope, type SystemTx } from '@/lib/system-scope';

/** The modules this sweep refunds. Not M17: see the file comment. */
export const ORPHAN_SWEEP_MODULES = ['M18'] as const;

/** SystemAlert source of the job's "refunded N orphans" summary. */
export const ORPHAN_ALERT_SOURCE = 'ai-reservation-orphans';

const BATCH = 200;
const MAX_BATCHES = 50;

export interface OrphanReservationSweepResult {
  /** Reservations refunded this run. */
  released: number;
  /** Credits given back with them. */
  credits: number;
  /** True when MAX_BATCHES stopped the run with orphans possibly left. */
  more: boolean;
}

export interface OrphanReservationSweepOptions {
  /** A reservation younger than this may still be running. */
  olderThanMinutes: number;
  /** Test seam: the defaults are the production values. */
  batchSize?: number;
  maxBatches?: number;
}

interface Candidate {
  id: string;
  tenantId: string;
  refId: string;
  /** The debit's size, i.e. what the refund gives back. */
  credits: number;
}

/**
 * Refunds every tenant's orphaned reservation of ORPHAN_SWEEP_MODULES (see the file comment).
 *
 * Cross-tenant on purpose, like releaseStaleRuns: the WHERE clause is a reason, a date and two
 * NOT EXISTS probes, and the tenant set is whatever it matches. `CreditLedger` and `AiUsageLog`
 * are FORCE RLS, so under `fabrika_app` an unscoped scan would see no row and report 0.
 */
export async function releaseOrphanReservations(
  now: Date,
  options: OrphanReservationSweepOptions,
): Promise<OrphanReservationSweepResult> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('releaseOrphanReservations: `now` must be a valid Date.');
  }
  const minutes = options.olderThanMinutes;
  const batchSize = options.batchSize ?? BATCH;
  const maxBatches = options.maxBatches ?? MAX_BATCHES;
  if (![minutes, batchSize, maxBatches].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('releaseOrphanReservations: olderThanMinutes, batchSize and maxBatches must be positive integers.');
  }
  const cutoff = new Date(now.getTime() - minutes * 60_000);

  const result: OrphanReservationSweepResult = { released: 0, credits: 0, more: false };
  for (const moduleId of ORPHAN_SWEEP_MODULES) {
    // Ids ascend, so a row that stays (its refund or marker arrived meanwhile) is never picked twice.
    let cursor: string | null = null;
    for (let batch = 0; ; batch++) {
      const step: BatchOutcome = await withSystemScope('cross-tenant-job', 'ai-reservation-orphans.release', (tx) =>
        sweepBatch(tx, moduleId, cutoff, cursor, batchSize),
      );
      result.released += step.released;
      result.credits += step.credits;
      if (step.scanned < batchSize) break;
      cursor = step.lastId;
      if (batch + 1 >= maxBatches) {
        result.more = true;
        break;
      }
    }
  }
  return result;
}

interface BatchOutcome {
  scanned: number;
  lastId: string | null;
  released: number;
  credits: number;
}

/** The orphan predicate, on `c` (a CreditLedger row). `onlyIds` narrows it for the re-read under the locks. */
function orphans(
  tx: SystemTx,
  module: string,
  cutoff: Date,
  cursor: string | null,
  limit: number,
  onlyIds: readonly string[] | null = null,
): Promise<Candidate[]> {
  return tx.$queryRaw<Candidate[]>`
    WITH first_marker AS (
      SELECT min(u."createdAt") AS at FROM "AiUsageLog" u WHERE u.module = ${module} AND u."refId" IS NOT NULL
    )
    SELECT c.id, c."tenantId", c."refId", (-c.delta)::int AS credits
      FROM "CreditLedger" c, first_marker f
     WHERE c.reason = ${`usage:${module}`}
       AND c.delta < 0
       AND c."refId" LIKE ${`${module}:%`}
       AND c."createdAt" < ${cutoff}
       AND f.at IS NOT NULL
       AND c."createdAt" >= f.at
       AND NOT EXISTS (SELECT 1 FROM "CreditLedger" r
                        WHERE r."tenantId" = c."tenantId" AND r."refId" = c."refId" AND r.reason = ${`refund:${module}`})
       AND NOT EXISTS (SELECT 1 FROM "AiUsageLog" m WHERE m."tenantId" = c."tenantId" AND m."refId" = c."refId")
       ${cursor === null ? Prisma.empty : Prisma.sql`AND c.id > ${cursor}`}
       ${onlyIds === null ? Prisma.empty : Prisma.sql`AND c.id = ANY(${[...onlyIds]}::text[])`}
     ORDER BY c.id ASC
     LIMIT ${limit}`;
}

async function sweepBatch(tx: SystemTx, module: string, cutoff: Date, cursor: string | null, batchSize: number): Promise<BatchOutcome> {
  const rows = await orphans(tx, module, cutoff, cursor, batchSize);
  const lastId = rows.at(-1)?.id ?? null;
  if (rows.length === 0) return { scanned: 0, lastId, released: 0, credits: 0 };

  // Tenant locks in one fixed order (as stale-runs.ts): two sweeps cannot wait on each other.
  const tenants = [...new Set(rows.map((r) => r.tenantId))].sort();
  for (const tenantId of tenants) {
    await lockTenantCredits(tx, tenantId);
  }
  // The scan was not locked: read the orphans again under the locks. A refund (the action's own,
  // or another sweep's) that committed meanwhile takes the row out, so every row left here is
  // refunded by the call below (it writes nothing only for an already refunded refId).
  const still = await orphans(tx, module, cutoff, null, batchSize, rows.map((r) => r.id));
  let released = 0;
  let credits = 0;
  for (const r of still) {
    await releaseAiReservation(tx, { tenantId: r.tenantId, module, refId: r.refId });
    released += 1;
    credits += r.credits;
  }
  return { scanned: rows.length, lastId, released, credits };
}

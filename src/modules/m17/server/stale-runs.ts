/**
 * M17 stale-run sweeper (FO-317): the `m17-stale-runs` job (src/lib/jobs/tasks/m17-stale-runs.ts)
 * runs this every 15 minutes.
 *
 * A run whose process was killed (deploy, crash, platform timeout) leaves its analysis ANALYZING
 * with its price reserved on the ledger (FO-274). Until now that reservation came back only when
 * the same user started the same analysis again (claim) or deleted it; a user who never came back
 * kept paying for a result that never arrived. This gives it back on its own.
 *
 * Dead means what it means to the claim: ANALYZING with `updatedAt` older than STALE_CLAIM_MS
 * (evaluate.ts), past the route's maxDuration plus a margin, so the platform has already killed
 * the run's process. For each such run, under the tenant credit lock:
 *   • its reservation is released with releaseAiReservation (refId = runRef(id, claim instant)):
 *     the one refund path, no second credit formula (CLAUDE.md rule 5);
 *   • the row goes ANALYZING → FAILED, matched on the same claim instant, as markFailed does,
 *     so the user can run it again and uploads are no longer refused.
 *
 * Idempotent: the release writes nothing for a reservation already refunded, and a FAILED row
 * no longer matches the scan, so a second run, or two racing (the tenant lock serialises them),
 * refund once. A fresh claim is not touched. A late run that still reaches its DONE write holds
 * the same tenant lock (FO-303 Ö-1), so either its DONE commits first and the re-read under the
 * lock skips it (a delivered result keeps its charge), or the sweep commits first and the DONE
 * write, matched on `status: 'ANALYZING'` and the claim instant, rolls back.
 *
 * Paged like retention.ts: one transaction per BATCH rows, at most MAX_BATCHES per run; the
 * rest is reported as `more` and the next tick carries on.
 */
import { lockTenantCredits, releaseAiReservation } from '@/lib/llm';
import { withSystemScope, type SystemTx } from '@/lib/system-scope';

import { EVALUATE_MODULE, STALE_CLAIM_MS, runRef } from './evaluate';

const BATCH = 200;
const MAX_BATCHES = 50;

export interface StaleRunSweepResult {
  /** Runs moved ANALYZING → FAILED, each with its reservation released. */
  released: number;
  /** True when MAX_BATCHES stopped the run with stale rows possibly left. */
  more: boolean;
}

/** Test seam: the defaults are the production values. */
export interface StaleRunSweepOptions {
  batchSize?: number;
  maxBatches?: number;
}

/**
 * Releases the reservation of every tenant's dead M17 run (ANALYZING, claimed before
 * `now − STALE_CLAIM_MS`) and marks it FAILED.
 *
 * Cross-tenant on purpose, like purgeExpiredInterregText: the WHERE clause is a status and a
 * date and the tenant set is whatever it matches. `InterregAnalysis` and `CreditLedger` are
 * FORCE RLS, so under `fabrika_app` an unscoped scan would see no row and report 0.
 */
export async function releaseStaleRuns(now: Date = new Date(), options: StaleRunSweepOptions = {}): Promise<StaleRunSweepResult> {
  // An Invalid Date would turn `lt: staleBefore` into a filter that matches nothing and report success.
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('releaseStaleRuns: `now` must be a valid Date.');
  }
  const batchSize = options.batchSize ?? BATCH;
  const maxBatches = options.maxBatches ?? MAX_BATCHES;
  if (![batchSize, maxBatches].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('releaseStaleRuns: batchSize and maxBatches must be positive integers.');
  }
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);

  const result: StaleRunSweepResult = { released: 0, more: false };
  // Ids ascend, so a row that stays (its DONE won the race, or a new claim moved it) is never
  // picked twice and the loop always ends.
  let cursor: string | null = null;
  for (let batch = 0; ; batch++) {
    const step: BatchOutcome = await withSystemScope('cross-tenant-job', 'm17-stale-runs.release', (tx) =>
      sweepBatch(tx, staleBefore, cursor, batchSize),
    );
    result.released += step.released;
    if (step.scanned < batchSize) break;
    cursor = step.lastId;
    if (batch + 1 >= maxBatches) {
      result.more = true;
      break;
    }
  }
  return result;
}

interface BatchOutcome {
  scanned: number;
  lastId: string | null;
  released: number;
}

async function sweepBatch(tx: SystemTx, staleBefore: Date, cursor: string | null, batchSize: number): Promise<BatchOutcome> {
  const stale = { status: 'ANALYZING' as const, updatedAt: { lt: staleBefore } };
  const rows = await tx.interregAnalysis.findMany({
    where: cursor === null ? stale : { ...stale, id: { gt: cursor } },
    select: { id: true, tenantId: true },
    orderBy: { id: 'asc' },
    take: batchSize,
  });
  const lastId = rows.at(-1)?.id ?? null;
  if (rows.length === 0) return { scanned: 0, lastId, released: 0 };

  // Tenant locks in one fixed order (as retention.ts): two sweeps cannot wait on each other.
  const tenants = [...new Set(rows.map((r) => r.tenantId))].sort();
  for (const tenantId of tenants) {
    await lockTenantCredits(tx, tenantId);
  }
  // The scan was not locked: read the claim again under the locks. A run whose DONE committed
  // meanwhile is no longer ANALYZING, and its reservation is its delivered result.
  const dead = await tx.interregAnalysis.findMany({
    where: { ...stale, id: { in: rows.map((r) => r.id) } },
    select: { id: true, tenantId: true, updatedAt: true },
  });
  let released = 0;
  for (const r of dead) {
    await releaseAiReservation(tx, { tenantId: r.tenantId, module: EVALUATE_MODULE, refId: runRef(r.id, r.updatedAt) });
    const { count } = await tx.interregAnalysis.updateMany({
      where: { id: r.id, tenantId: r.tenantId, status: 'ANALYZING', updatedAt: r.updatedAt },
      data: { status: 'FAILED' },
    });
    released += count;
  }
  return { scanned: rows.length, lastId, released };
}

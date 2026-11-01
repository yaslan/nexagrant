/**
 * M17 text retention (FO-195 B1/B5, ADR-0010): the nightly `m17-text-retention` job
 * (src/lib/jobs/tasks/m17-text-retention.ts) runs this.
 *
 * The extracted text of an upload is kept 30 days FROM THAT SLOT'S OWN UPLOAD
 * (`callTextExpiresAt`, `projectTextExpiresAt`; set by saveDocument). When a slot is
 * due, the whole slot is emptied — text, file name, format, pages, chars, extracted-at
 * and expiry — exactly the state of a slot nobody uploaded to, then:
 *   • the status is recomputed by the same rule an upload uses (./status.ts), so a
 *     READY analysis whose project file expired is CALL_READY again, not a READY with
 *     nothing to read. ANALYZING is left alone while both texts are still there (the F2
 *     run owns it); once a slot is emptied the status is recomputed like any other row's
 *     (FO-191 B4: the run can no longer finish, and a row left ANALYZING refuses uploads).
 *   • the F2 result and criterion marks are deleted: their quotes are the document's
 *     text, and a mark without the text it was drawn from cannot be re-checked.
 * The analysis row itself stays (the user's list, the rubric choice); the user's own
 * DELETE (analyses.ts deleteAnalysis) and the FK cascades of a deleted user or tenant
 * remove it whole (docs/adr/0010 §M17).
 *
 * Idempotent: only slots whose expiry has passed match, and an emptied slot has none,
 * so a second run, or two racing, changes nothing. An upload that lands between the
 * scan and the write moved the expiry forward; the write's own WHERE (re-evaluated on
 * the locked row) then no longer matches and the fresh text is kept.
 *
 * Volume (FO-195 B1): the work is paged, one transaction per page of BATCH analyses, so
 * its cost per transaction is constant however large the backlog. A run stops at
 * MAX_BATCHES pages or BUDGET_MS and reports `more`; the pages it committed stay.
 */
import { Prisma } from '@prisma/client';

import { lockTenantCredits, releaseAiReservation } from '@/lib/llm';
import { withSystemScope, type SystemTx } from '@/lib/system-scope';

import { EVALUATE_MODULE, runRef } from './evaluate';
import { STATUS_FROM_TEXTS_SQL } from './status';

const BATCH = 500;
/** 100 000 analyses in one run; more than that is left for the next night (reported as `more`). */
const MAX_BATCHES = 200;
/** Wall-clock budget of one run; a run that spends it stops after the batch in flight (reported as `more`). */
const BUDGET_MS = 5 * 60 * 1000;

export interface InterregRetentionResult {
  /** Slots whose text was deleted. */
  callSlots: number;
  projectSlots: number;
  /** Analyses touched (a row with both slots due counts once). */
  analyses: number;
  /** True when MAX_BATCHES or the time budget stopped the run with due rows left. */
  more: boolean;
}

/** Test seam: the defaults are the production values. */
export interface InterregRetentionOptions {
  batchSize?: number;
  maxBatches?: number;
  budgetMs?: number;
}

/**
 * Deletes every tenant's M17 document text whose slot expiry is at or before `now`.
 *
 * Cross-tenant on purpose, like pruneOldNotifications: the WHERE clause is a date and
 * the tenant set is whatever it matches. `InterregAnalysis` is FORCE RLS, so under
 * `fabrika_app` an unscoped updateMany would see no rows and report success while
 * every text stayed.
 *
 * One BATCH per transaction. A single transaction around the whole backlog hit
 * Prisma's 5 s interactive limit at ~40 000 due rows and rolled all of it back, every
 * night, for ever (crw2-fb, PR #202). Now each batch commits on its own, so a run that
 * is cut short (time budget, batch cap, crash, deploy) keeps what it finished, and the
 * next run — the same query, since an emptied slot no longer matches — carries on.
 */
export async function purgeExpiredInterregText(
  now: Date = new Date(),
  options: InterregRetentionOptions = {},
): Promise<InterregRetentionResult> {
  // An Invalid Date would turn `lte: now` into a filter that matches nothing and report success.
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('purgeExpiredInterregText: `now` must be a valid Date.');
  }
  const batchSize = options.batchSize ?? BATCH;
  const maxBatches = options.maxBatches ?? MAX_BATCHES;
  const budgetMs = options.budgetMs ?? BUDGET_MS;
  if (![batchSize, maxBatches].every((n) => Number.isInteger(n) && n > 0) || !(budgetMs > 0)) {
    throw new Error('purgeExpiredInterregText: batchSize, maxBatches and budgetMs must be positive.');
  }

  const result: InterregRetentionResult = { callSlots: 0, projectSlots: 0, analyses: 0, more: false };
  const started = performance.now();
  // Ids ascend, so each batch starts after the last one scanned: a row that stays due (raced,
  // or still ANALYZING) can never be picked twice, and the loop always ends.
  let cursor: string | null = null;

  for (let batch = 0; ; batch++) {
    const step: BatchOutcome = await withSystemScope('cross-tenant-job', 'm17-text-retention.purge', (tx) =>
      purgeBatch(tx, now, cursor, batchSize),
    );
    result.callSlots += step.callSlots;
    result.projectSlots += step.projectSlots;
    result.analyses += step.analyses;
    if (step.scanned < batchSize) break; // fewer than a full page: nothing due is left
    cursor = step.lastId;
    if (batch + 1 >= maxBatches || performance.now() - started >= budgetMs) {
      result.more = true;
      break;
    }
  }
  return result;
}

interface BatchOutcome {
  scanned: number;
  lastId: string | null;
  callSlots: number;
  projectSlots: number;
  analyses: number;
}

/**
 * One page, one transaction: scan, empty the slots, recompute status, drop the derived rows.
 *
 * An ANALYZING row keeps its status only while both texts are still there. A run whose text
 * the purge just emptied can never finish (its result write needs both), and the purge's own
 * `updatedAt` bump has already cost it its claim, so its failure handler would leave the row
 * ANALYZING for good, and an ANALYZING row refuses every upload (FO-191 B4).
 */
async function purgeBatch(
  tx: SystemTx,
  now: Date,
  cursor: string | null,
  batchSize: number,
): Promise<BatchOutcome> {
  const due = { OR: [{ callTextExpiresAt: { lte: now } }, { projectTextExpiresAt: { lte: now } }] };
  const rows = await tx.interregAnalysis.findMany({
    where: cursor === null ? due : { AND: [due, { id: { gt: cursor } }] },
    select: { id: true, tenantId: true, status: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take: batchSize,
  });
  const lastId = rows.at(-1)?.id ?? null;
  if (rows.length === 0) return { scanned: 0, lastId, callSlots: 0, projectSlots: 0, analyses: 0 };
  const ids = rows.map((r) => r.id);

  // A run still holding the claim (ANALYZING) whose text is due loses that text below and can
  // never finish, so its reservation is given back first (FO-291 B1). This must come before the
  // updates: they bump `updatedAt`, which is the run's ledger reference (runRef).
  // The page is already the due rows, so its ANALYZING ones are the runs to release.
  const running = rows.filter((r) => r.status === 'ANALYZING');
  // Tenant locks in one fixed order, then the releases: two batches cannot wait on each other.
  for (const tenantId of [...new Set(running.map((r) => r.tenantId))].sort()) {
    await lockTenantCredits(tx, tenantId);
  }
  for (const r of running) {
    await releaseAiReservation(tx, { tenantId: r.tenantId, module: EVALUATE_MODULE, refId: runRef(r.id, r.updatedAt) });
  }

  // The expiry is part of each write's WHERE: a row re-uploaded since the scan is skipped.
  const call = await tx.interregAnalysis.updateMany({
    where: { id: { in: ids }, callTextExpiresAt: { lte: now } },
    data: {
      callFileName: null,
      callFormat: null,
      callPages: null,
      callChars: null,
      callText: null,
      callExtractedAt: null,
      callTextExpiresAt: null,
    },
  });
  const project = await tx.interregAnalysis.updateMany({
    where: { id: { in: ids }, projectTextExpiresAt: { lte: now } },
    data: {
      projectFileName: null,
      projectFormat: null,
      projectPages: null,
      projectChars: null,
      projectText: null,
      projectExtractedAt: null,
      projectTextExpiresAt: null,
    },
  });
  if (call.count + project.count > 0) {
    await tx.$executeRaw`
      UPDATE "InterregAnalysis"
         SET "status" = ${STATUS_FROM_TEXTS_SQL}
       WHERE "id" IN (${Prisma.join(ids)})
         AND ("status" <> 'ANALYZING' OR "callText" IS NULL OR "projectText" IS NULL)`;
    await tx.interregCriterionMark.deleteMany({ where: { analysisId: { in: ids } } });
    await tx.interregAnalysisResult.deleteMany({ where: { analysisId: { in: ids } } });
  }
  return {
    scanned: rows.length,
    lastId,
    callSlots: call.count,
    projectSlots: project.count,
    analyses: call.count + project.count > 0 ? ids.length : 0,
  };
}

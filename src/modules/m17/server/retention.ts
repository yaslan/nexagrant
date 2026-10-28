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
 *     nothing to read. ANALYZING is left alone: the F2 run owns it (contract for F2:
 *     read both texts, and treat a NULL one as "expired, ask for a new upload").
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
 */
import { Prisma } from '@prisma/client';

import { withSystemScope } from '@/lib/system-scope';

import { STATUS_FROM_TEXTS_SQL } from './status';

const BATCH = 500;
/** 100 000 analyses in one run; more than that is left for the next night (reported as `more`). */
const MAX_BATCHES = 200;

export interface InterregRetentionResult {
  /** Slots whose text was deleted. */
  callSlots: number;
  projectSlots: number;
  /** Analyses touched (a row with both slots due counts once). */
  analyses: number;
  /** True when MAX_BATCHES stopped the run with due rows left. */
  more: boolean;
}

/**
 * Deletes every tenant's M17 document text whose slot expiry is at or before `now`.
 *
 * Cross-tenant on purpose, like pruneOldNotifications: the WHERE clause is a date and
 * the tenant set is whatever it matches. `InterregAnalysis` is FORCE RLS, so under
 * `fabrika_app` an unscoped updateMany would see no rows and report success while
 * every text stayed.
 */
export async function purgeExpiredInterregText(now: Date = new Date()): Promise<InterregRetentionResult> {
  // An Invalid Date would turn `lte: now` into a filter that matches nothing and report success.
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('purgeExpiredInterregText: `now` must be a valid Date.');
  }
  return withSystemScope('cross-tenant-job', 'm17-text-retention.purge', async (tx) => {
    const result: InterregRetentionResult = { callSlots: 0, projectSlots: 0, analyses: 0, more: false };
    const due = { OR: [{ callTextExpiresAt: { lte: now } }, { projectTextExpiresAt: { lte: now } }] };

    for (let batch = 0; ; batch++) {
      if (batch === MAX_BATCHES) {
        result.more = true;
        break;
      }
      const rows = await tx.interregAnalysis.findMany({
        where: due,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.id);

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
      result.callSlots += call.count;
      result.projectSlots += project.count;
      if (call.count + project.count === 0) break; // every candidate was re-uploaded meanwhile

      await tx.$executeRaw`
        UPDATE "InterregAnalysis"
           SET "status" = ${STATUS_FROM_TEXTS_SQL}
         WHERE "id" IN (${Prisma.join(ids)}) AND "status" <> 'ANALYZING'`;
      await tx.interregCriterionMark.deleteMany({ where: { analysisId: { in: ids } } });
      await tx.interregAnalysisResult.deleteMany({ where: { analysisId: { in: ids } } });
      result.analyses += ids.length;
      if (rows.length < BATCH) break;
    }
    return result;
  });
}

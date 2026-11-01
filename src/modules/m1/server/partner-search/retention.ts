import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PARTNER_SEARCH_SOURCE } from '@/lib/adapters/partner-search';
import { isPresentId } from '@/lib/required-id';
import { isPartnerSearchIngestionEnabled } from './flag';
import { refreshOrganisationFlags } from './ingestor';

/**
 * Partner Search retention (FO-65 F4 / TASK-MVL3LMW9R7S5E; also FO-60 card step 5).
 *
 * Four rules, one nightly job, no-op while the global flag is off:
 *  - announcements of a CLOSED topic are deleted 90 days after their last scan
 *    (closed topics are no longer scanned, so `lastSeenAt` is the closing date);
 *  - withdrawn announcements are deleted 30 days after `withdrawnAt`, on any topic;
 *  - RawFetch rows of a CLOSED topic are deleted 90 days after they were fetched;
 *  - every other `partner_search` RawFetch row older than 30 days is deleted unless it
 *    is the newest snapshot of its key (PR #163 review Ö2, lead decision). An old
 *    snapshot still carries the summary of an announcement withdrawn since, so the
 *    30-day rule would not hold without it; the newest one is the ingestor's
 *    change baseline and stays.
 *
 * Lead decision (FO-60): closed-topic rows are DELETED after 90 days, not moved to an
 * archive table. The card's "arşivlenir" wording is superseded by that decision.
 * PIC flags are recomputed for the PICs that lost rows.
 */

export const CLOSED_RETENTION_DAYS = 90;
export const WITHDRAWN_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Throws on an invalid `now`: an Invalid Date cutoff would leave the deletes without a bound. */
export function retentionCutoffs(now: Date): { closedBefore: Date; withdrawnBefore: Date } {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError('partner-search retention: now is not a valid date; refusing an unbounded delete');
  }
  return {
    closedBefore: new Date(now.getTime() - CLOSED_RETENTION_DAYS * DAY_MS),
    withdrawnBefore: new Date(now.getTime() - WITHDRAWN_RETENTION_DAYS * DAY_MS),
  };
}

export interface RetentionSummary {
  closedDeleted: number;
  withdrawnDeleted: number;
  rawFetchDeleted: number;
}

export type PartnerSearchRetentionOutcome =
  | { kind: 'skipped'; reason: 'flag-off' }
  | { kind: 'done'; summary: RetentionSummary };

export async function runPartnerSearchRetention(now: Date = new Date()): Promise<PartnerSearchRetentionOutcome> {
  if (!(await isPartnerSearchIngestionEnabled())) {
    logger.info('[partner-search] flag OFF; retention skipped');
    return { kind: 'skipped', reason: 'flag-off' };
  }

  const { closedBefore, withdrawnBefore } = retentionCutoffs(now);
  // Relation filters, not `in: [...]` lists: the closed-topic set only grows (crw2-fb).
  const closedWhere = { topic: { status: 'CLOSED' as const }, lastSeenAt: { lt: closedBefore } };
  const stale = await prisma.partnerSearchAnnouncement.findMany({
    where: closedWhere,
    select: { organizationPic: true },
    distinct: ['organizationPic'],
  });
  const closedDeleted = await prisma.partnerSearchAnnouncement.deleteMany({ where: closedWhere });
  const pics = new Set(stale.map((s) => s.organizationPic).filter(isPresentId));
  await refreshOrganisationFlags(pics);

  const withdrawn = await prisma.partnerSearchAnnouncement.deleteMany({
    where: { withdrawnAt: { lt: withdrawnBefore } },
  });

  const rawClosed = await prisma.$executeRaw`
    DELETE FROM "RawFetch" r
     WHERE r."source" = ${PARTNER_SEARCH_SOURCE}
       AND r."fetchedAt" < ${closedBefore}
       AND EXISTS (SELECT 1 FROM "Topic" t WHERE t."identifier" = r."key" AND t."status" = 'CLOSED')`;
  const rawSuperseded = await prisma.$executeRaw`
    DELETE FROM "RawFetch" r
     WHERE r."source" = ${PARTNER_SEARCH_SOURCE}
       AND r."fetchedAt" < ${withdrawnBefore}
       AND EXISTS (
         SELECT 1 FROM "RawFetch" n
          WHERE n."source" = r."source" AND n."key" = r."key"
            AND (n."fetchedAt", n."id") > (r."fetchedAt", r."id"))`;

  const summary = {
    closedDeleted: closedDeleted.count,
    withdrawnDeleted: withdrawn.count,
    rawFetchDeleted: rawClosed + rawSuperseded,
  };
  logger.info('[partner-search] retention done', summary);
  return { kind: 'done', summary };
}

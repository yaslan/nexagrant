import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PARTNER_SEARCH_SOURCE } from '@/lib/adapters/partner-search';
import { isPresentId } from '@/lib/required-id';
import { isPartnerSearchIngestionEnabled } from './flag';
import { refreshOrganisationFlags } from './ingestor';

/**
 * Partner Search retention (FO-65 F4 / TASK-MVL3LMW9R7S5E; also FO-60 card step 5).
 *
 * Three rules, one nightly job, no-op while the global flag is off:
 *  - announcements of a CLOSED topic are deleted 90 days after their last scan
 *    (closed topics are no longer scanned, so `lastSeenAt` is the closing date);
 *  - withdrawn announcements are deleted 30 days after `withdrawnAt`;
 *  - RawFetch rows of a CLOSED topic are deleted 90 days after they were fetched.
 *
 * Deleting closed-topic rows is also the "90 days archive" of the card: one rule,
 * one implementation. PIC flags are recomputed for the PICs that lost rows.
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
  const closed = await prisma.topic.findMany({ where: { status: 'CLOSED' }, select: { identifier: true } });
  const closedIds = closed.map((t) => t.identifier).filter(isPresentId);

  const stale = await prisma.partnerSearchAnnouncement.findMany({
    where: { topicIdentifier: { in: closedIds }, lastSeenAt: { lt: closedBefore } },
    select: { externalId: true, organizationPic: true },
  });
  const closedDeleted = await prisma.partnerSearchAnnouncement.deleteMany({
    where: { externalId: { in: stale.map((s) => s.externalId).filter(isPresentId) } },
  });
  const pics = new Set(stale.map((s) => s.organizationPic).filter(isPresentId));
  await refreshOrganisationFlags(pics);

  const withdrawn = await prisma.partnerSearchAnnouncement.deleteMany({
    where: { withdrawnAt: { lt: withdrawnBefore } },
  });

  const raw = await prisma.rawFetch.deleteMany({
    where: { source: PARTNER_SEARCH_SOURCE, key: { in: closedIds }, fetchedAt: { lt: closedBefore } },
  });

  const summary = {
    closedDeleted: closedDeleted.count,
    withdrawnDeleted: withdrawn.count,
    rawFetchDeleted: raw.count,
  };
  logger.info('[partner-search] retention done', summary);
  return { kind: 'done', summary };
}

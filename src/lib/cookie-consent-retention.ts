import type { Prisma } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';

/**
 * How long one CookieConsentRecord row (anonymous visitor id, choice, policy
 * version, time) is kept, counted from that row's own `createdAt` (NG-366,
 * NG-363 B-1).
 *
 * 1095 days = 3 years. The patron approved it on 26.11.2026 on the proposal in
 * docs/agent-results/NG-366-pm-gnd.md (option B): about a year of use plus a
 * couple of years to answer a later claim. This is a product decision, not a
 * legal opinion; the cookie policy text still waits for legal review.
 *
 * Each row goes on its own schedule. A renewed choice does not remove the older
 * row, and no row is kept forever. The window is one constant here, next to the
 * purge that uses it, so the nightly job and the tests cannot disagree.
 */
export const COOKIE_CONSENT_RETENTION_DAYS = 1095;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment before which a consent row is purged. */
export function cookieConsentPurgeCutoff(now: Date, retentionDays: number = COOKIE_CONSENT_RETENTION_DAYS): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    // Zero or a negative window would reach rows written today.
    throw new RangeError(`cookie consent retention must be a whole number of days >= 1, got ${retentionDays}`);
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('cookie consent retention: `now` is not a valid date');
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/** The one filter the purge deletes by. A bad cutoff throws: never a filterless delete. */
export function purgeableCookieConsentWhere(cutoff: Date): Prisma.CookieConsentRecordWhereInput {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new RangeError('cookie consent retention: cutoff is not a valid date; refusing a filterless delete');
  }
  return { createdAt: { lt: cutoff } };
}

export interface CookieConsentPurgeResult {
  deletedCount: number;
  cutoff: string;
  retentionDays: number;
}

/**
 * Deletes every consent row older than the retention window. Returns the count
 * only: no visitor id, choice or other row content leaves this function.
 *
 * Cross-tenant on purpose: the table has no tenantId, so there is no tenant to
 * hand withTenant. The `cross-tenant-job` purpose opens CookieConsentRecord
 * (prisma/rls.sql, system_scope_open). Idempotent: a second run the same day
 * finds nothing.
 */
export async function purgeOldCookieConsents(
  options: { now?: Date } = {},
): Promise<CookieConsentPurgeResult> {
  const retentionDays = COOKIE_CONSENT_RETENTION_DAYS;
  const cutoff = cookieConsentPurgeCutoff(options.now ?? new Date(), retentionDays);
  const due = purgeableCookieConsentWhere(cutoff);

  return withSystemScope('cross-tenant-job', 'cookie-consent-retention.purge', async (tx) => {
    const { count } = await tx.cookieConsentRecord.deleteMany({ where: due });
    return { deletedCount: count, cutoff: cutoff.toISOString(), retentionDays };
  });
}

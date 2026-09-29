import type { Prisma } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';

/**
 * How long an Invitation row — the invited person's e-mail address — is kept
 * once the invitation can no longer be used (TASK-MUN2J9LLXNREG).
 *
 * 30 days after the link was accepted, or 30 days after it expired unaccepted.
 * The same 30 days the platform already keeps for the erasure grace period
 * (`users-scheduled-deletion`), the Stripe event log and the default agency
 * invite code, so an admin who asks "who did we invite last month?" still gets
 * an answer, and nothing about the address outlives the month after it. A link
 * is valid for 7 days (src/app/api/invitations/route.ts), so an unaccepted row
 * lives at most 37 days from its last send. docs/legal/processing-register.md §2.
 */
export const INVITATION_RETENTION_DAYS = 30;

/** AuditEvent type of one purge in one tenant. The row carries a count, never an address. */
export const INVITATION_PURGED = 'invitation.purged';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment before which a used or expired invitation is purged. */
export function invitationPurgeCutoff(now: Date, retentionDays: number = INVITATION_RETENTION_DAYS): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    // Zero or a negative window would reach invitations that are still pending.
    throw new RangeError(`invitation retention must be a whole number of days >= 1, got ${retentionDays}`);
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('invitation retention: `now` is not a valid date');
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Rows the purge may delete. Built from a checked Date only, so neither branch
 * can lose its filter: an accepted invitation by when it was accepted, an
 * unaccepted one by when its link expired. A pending, unexpired row matches
 * neither. A re-invite clears `acceptedAt` and moves `expires` forward, so a
 * row re-sent inside the window is out of reach again.
 */
export function purgeableInvitationWhere(cutoff: Date): Prisma.InvitationWhereInput {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new RangeError('invitation retention: cutoff is not a valid date; refusing a filterless delete');
  }
  return {
    OR: [
      { acceptedAt: { not: null, lt: cutoff } },
      { acceptedAt: null, expires: { lt: cutoff } },
    ],
  };
}

export interface InvitationPurgeResult {
  deletedCount: number;
  tenantCount: number;
  cutoff: string;
  retentionDays: number;
}

/**
 * Deletes every used or expired invitation older than the retention window and
 * writes one `invitation.purged` AuditEvent per tenant it touched, with the
 * count only.
 *
 * Cross-tenant on purpose, like pruneOldStripeEvents: the tenant set is
 * whatever the date filter matches, so there is no tenant to hand withTenant,
 * and under `fabrika_app` an unscoped delete would see no row and report 0.
 * Delete and audit share one transaction: a purge is never recorded without
 * happening, nor the other way round. Idempotent: a second run the same day
 * finds nothing.
 */
export async function purgeOldInvitations(
  options: { now?: Date; retentionDays?: number } = {}
): Promise<InvitationPurgeResult> {
  const retentionDays = options.retentionDays ?? INVITATION_RETENTION_DAYS;
  const cutoff = invitationPurgeCutoff(options.now ?? new Date(), retentionDays);
  const due = purgeableInvitationWhere(cutoff);

  return withSystemScope('cross-tenant-job', 'invitation-retention.purge', async (tx) => {
    const groups = await tx.invitation.groupBy({ by: ['tenantId'], where: due, orderBy: { tenantId: 'asc' } });

    let deletedCount = 0;
    let tenantCount = 0;
    for (const { tenantId } of groups) {
      // `due` again, not a list of ids read above: a row re-invited since the
      // read no longer matches and stays.
      const { count } = await tx.invitation.deleteMany({ where: { AND: [{ tenantId }, due] } });
      if (count === 0) continue;
      await tx.auditEvent.create({
        data: {
          tenantId,
          type: INVITATION_PURGED,
          data: { count, retentionDays, cutoff: cutoff.toISOString() },
        },
      });
      deletedCount += count;
      tenantCount += 1;
    }
    return { deletedCount, tenantCount, cutoff: cutoff.toISOString(), retentionDays };
  });
}

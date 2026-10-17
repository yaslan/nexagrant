import type { Prisma } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';
import { EXPERT_PREREG_RETENTION_DAYS } from './constants';

/** AuditEvent type of one nightly purge. The row carries a count, never a person. */
export const EXPERT_PREREG_PURGED = 'expert_prereg.purged';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment before which a pre-registration row is purged. */
export function expertPreRegPurgeCutoff(now: Date, retentionDays: number = EXPERT_PREREG_RETENTION_DAYS): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new RangeError(`expert pre-registration retention must be a whole number of days >= 1, got ${retentionDays}`);
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('expert pre-registration retention: `now` is not a valid date');
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Rows the purge may delete: created before the cutoff, except the row that holds
 * the highest founder number.
 *
 * That row stays for good. The next founder number is `max(founderNumber) + 1`
 * (verify.ts), so deleting the holder of the maximum would hand its number out again.
 * Keeping it keeps the numbering and the seat count (`100 − max`) exactly where they
 * were. Other founder rows and unverified rows (`founderNumber` NULL) match on age alone.
 */
export function purgeableExpertPreRegWhere(
  cutoff: Date,
  highestFounderNumber: number | null
): Prisma.ExpertPreRegistrationWhereInput {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new RangeError('expert pre-registration retention: cutoff is not a valid date; refusing a filterless delete');
  }
  if (highestFounderNumber === null) return { createdAt: { lt: cutoff } };
  return {
    createdAt: { lt: cutoff },
    OR: [{ founderNumber: null }, { founderNumber: { lt: highestFounderNumber } }],
  };
}

export interface ExpertPreRegPurgeResult {
  deletedCount: number;
  cutoff: string;
  retentionDays: number;
}

/**
 * Deletes every pre-registration older than the retention window (see
 * {@link purgeableExpertPreRegWhere}) and, when it deleted anything, writes one
 * `expert_prereg.purged` AuditEvent with the count only.
 *
 * Platform data with no tenant, so the purge runs under `system_scope`
 * (`cross-tenant-job`); the NULL-tenant audit row is writable only there too, so the
 * delete and the audit share one transaction. Idempotent: a second run the same day
 * finds nothing. The window is not taken from the caller beyond `now`: a job added by
 * hand purges exactly what the cron would.
 */
export async function purgeOldExpertPreRegistrations(options: { now?: Date } = {}): Promise<ExpertPreRegPurgeResult> {
  const retentionDays = EXPERT_PREREG_RETENTION_DAYS;
  const cutoff = expertPreRegPurgeCutoff(options.now ?? new Date(), retentionDays);

  return withSystemScope('cross-tenant-job', 'expert-prereg-retention.purge', async (tx) => {
    const top = await tx.expertPreRegistration.aggregate({
      _max: { founderNumber: true },
    });
    const { count } = await tx.expertPreRegistration.deleteMany({
      where: purgeableExpertPreRegWhere(cutoff, top._max.founderNumber),
    });
    if (count > 0) {
      await tx.auditEvent.create({
        data: {
          tenantId: null,
          type: EXPERT_PREREG_PURGED,
          data: { count, retentionDays, cutoff: cutoff.toISOString() },
        },
      });
    }
    return {
      deletedCount: count,
      cutoff: cutoff.toISOString(),
      retentionDays,
    };
  });
}

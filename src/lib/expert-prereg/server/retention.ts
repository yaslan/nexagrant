import type { Prisma } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';
import { EXPERT_PREREG_LOCK_KEY, EXPERT_PREREG_RETENTION_DAYS } from './constants';
import { lastFounderNumberGiven, recordFounderNumberGiven } from './founder-counter';

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
 * Rows the purge deletes: every row created before the cutoff, verified or not,
 * founder number or not (K-568932 = A). The founder numbers live on in the
 * founder counter (./founder-counter.ts), so no number is freed.
 */
export function purgeableExpertPreRegWhere(cutoff: Date): Prisma.ExpertPreRegistrationWhereInput {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new RangeError('expert pre-registration retention: cutoff is not a valid date; refusing a filterless delete');
  }
  return { createdAt: { lt: cutoff } };
}

export interface ExpertPreRegPurgeResult {
  deletedCount: number;
  cutoff: string;
  retentionDays: number;
}

/**
 * Deletes every pre-registration older than the retention window (see
 * {@link purgeableExpertPreRegWhere}), the holder of the highest founder number
 * included, and, when it deleted anything, writes one
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
    // Under the verification's lock, and the counter first: a number that lives
    // only on a row about to go (counter behind the rows) is recorded before the row is.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPERT_PREREG_LOCK_KEY})`;
    await recordFounderNumberGiven(tx, await lastFounderNumberGiven(tx));
    const { count } = await tx.expertPreRegistration.deleteMany({
      where: purgeableExpertPreRegWhere(cutoff),
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

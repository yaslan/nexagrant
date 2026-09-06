import { createHash } from 'node:crypto';
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { deleteUserFilesFromR2 } from '@/lib/storage';
import {
  UsersScheduledDeletionOutputSchema,
  type UsersScheduledDeletionOutput,
} from '../events';

const DEFAULT_GRACE_PERIOD_DAYS = 30;

/**
 * Finds every account whose erasure grace period has expired and purges it.
 *
 * Exported separately from the Inngest wrapper so the rule can be unit-tested
 * and run on demand without an Inngest runtime — the scheduled function below
 * is only a trigger around this.
 */
export async function purgeDueUsers(
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS
): Promise<UsersScheduledDeletionOutput> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - gracePeriodDays);

  // Memberships are read here, before the purge: they cascade away with the
  // user row, and the audit trail needs to know which tenants were touched.
  const dueUsers = await prisma.user.findMany({
    where: { deletionRequestedAt: { not: null, lte: cutoff } },
    select: {
      id: true,
      deletionRequestedAt: true,
      deletionReason: true,
      memberships: { select: { tenantId: true } },
    },
  });

  let purgedCount = 0;
  let failedCount = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const user of dueUsers) {
    const userId = user.id;
    try {
      // 1. Object storage first — a failed DB delete must not orphan files.
      await deleteUserFilesFromR2(userId);

      // 2. Anonymise records the tenant must keep for billing/audit.
      await prisma.aiUsageLog.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // 3. Remove person-level rows that have no FK cascade.
      await prisma.effort.deleteMany({ where: { userId } });

      // 4. Finally the user row; cascades clear accounts, sessions,
      //    memberships and requested approvals, and null out approver/
      //    evaluation references.
      await prisma.user.delete({ where: { id: userId } });

      // 5. Record that the erasure happened. GDPR art.5(2) requires us to be
      //    able to demonstrate compliance, but the record must not re-create
      //    the identifier we just erased — so the subject is referenced by a
      //    one-way hash of their id. Anyone holding the original id can
      //    recompute the hash and confirm the deletion; the log on its own
      //    points at nobody.
      await writeErasureAudit(user);

      purgedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[users-scheduled-deletion] failed for user ${userId}:`, error);
      failedCount++;
      errors.push({ userId, message });
    }
  }

  const output: UsersScheduledDeletionOutput = {
    success: true,
    dueCount: dueUsers.length,
    purgedCount,
    failedCount,
  };

  if (errors.length > 0) output.errors = errors;

  return UsersScheduledDeletionOutputSchema.parse(output);
}

interface PurgedUser {
  id: string;
  deletionRequestedAt: Date | string | null;
  deletionReason: string | null;
  memberships: Array<{ tenantId: string }>;
}

/** Writes one `user.erased` AuditEvent per tenant the subject belonged to. */
async function writeErasureAudit(user: PurgedUser): Promise<void> {
  const subjectRef = createHash('sha256').update(user.id).digest('hex');
  const data = {
    subjectRef,
    // Values crossing a step.run boundary are JSON, so this can arrive as a
    // string even though Prisma selected a Date. new Date() accepts both.
    requestedAt: user.deletionRequestedAt
      ? new Date(user.deletionRequestedAt).toISOString()
      : null,
    reason: user.deletionReason ?? 'subject_request',
  };

  const tenantIds = [...new Set(user.memberships.map((m) => m.tenantId))];

  if (tenantIds.length === 0) {
    await prisma.auditEvent.create({
      data: { type: 'user.erased', target: subjectRef, data },
    });
    return;
  }

  for (const tenantId of tenantIds) {
    await prisma.auditEvent.create({
      data: { tenantId, type: 'user.erased', target: subjectRef, data },
    });
  }
}

/**
 * Users Scheduled Deletion — daily, 3 AM UTC.
 *
 * Permanently removes accounts whose KVKK/GDPR erasure grace period has expired.
 * `requestAccountDeletion` only soft-deletes; this job is the single place where
 * the irreversible purge happens, so a subject can still cancel until it runs.
 */
export const usersScheduledDeletion = inngest.createFunction(
  { id: 'users-scheduled-deletion', triggers: [{ cron: '0 3 * * *' }] },
  async ({ event, step }): Promise<UsersScheduledDeletionOutput> => {
    const gracePeriodDays =
      (event?.data as { gracePeriodDays?: number } | undefined)?.gracePeriodDays ??
      DEFAULT_GRACE_PERIOD_DAYS;

    return await step.run('purge-due-users', () => purgeDueUsers(gracePeriodDays));
  }
);

import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { INVITATION_RETENTION_DAYS, purgeOldInvitations } from '@/lib/invitations/retention';

/**
 * Invitation cleanup — nightly, 3:30 AM UTC (TASK-MUN2J9LLXNREG).
 *
 * Deletes invitations accepted, or expired unaccepted, more than
 * INVITATION_RETENTION_DAYS ago, so the invited person's address is not kept
 * for ever (docs/legal/processing-register.md §2). Each tenant touched gets an
 * `invitation.purged` AuditEvent with the count; no address is written
 * anywhere. The retention window is not taken from the payload: a job added by
 * hand purges exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once, because a retention promise
 * that silently stops being kept is the thing this job exists to prevent; the
 * queue then retries it (ADR-0008 §6.3), and the wrapper raises the
 * exhausted-job alert after the last attempt.
 */
export const invitationCleanupTask = defineJob('invitation-cleanup', async ({ tick }) => {
  try {
    const result = await purgeOldInvitations({ now: tick ?? new Date() });
    return { success: true, ...result };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'invitation-cleanup',
      message: `Invitation cleanup failed: ${errorMessage(error)}`,
      meta: { retentionDays: INVITATION_RETENTION_DAYS },
    });
    throw error;
  }
});

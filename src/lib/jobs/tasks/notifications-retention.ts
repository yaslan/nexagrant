import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { NOTIFICATION_RETENTION_DAYS, pruneNotificationStores } from '@/lib/notifications/retention';

/**
 * Notification retention — nightly, 3:50 AM UTC (ADR-0011 §3.4, TASK-MUVR24EHWI2RA).
 *
 * Deletes notifications older than NOTIFICATION_RETENTION_DAYS, read or not,
 * and e-mail outbox rows sent (sentAt) longer ago than the same window (NG-43).
 * The window is counted from the cron tick, not from the payload, so a job
 * added by hand deletes exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once — a retention promise that
 * silently stops being kept is what this job exists to prevent — and the queue
 * retries it (ADR-0008 §6.3).
 */
export const notificationsRetentionTask = defineJob('notifications-retention', async ({ tick }) => {
  try {
    const { notifications: deletedCount, sentEmails: sentEmailsDeleted } = await pruneNotificationStores(tick ?? new Date());
    return { success: true, deletedCount, sentEmailsDeleted, retentionDays: NOTIFICATION_RETENTION_DAYS };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'notifications-retention',
      message: `Notification retention failed: ${errorMessage(error)}`,
      meta: { retentionDays: NOTIFICATION_RETENTION_DAYS },
    });
    throw error;
  }
});

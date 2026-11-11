import { withSystemScope } from '@/lib/system-scope';

/**
 * How long a notification is kept, read or not (ADR-0011 §3.4, K-3 a).
 * Counted from `createdAt`.
 */
export const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Deletes every tenant's notifications older than the retention window and
 * returns how many went. Idempotent: a second run in the same hour deletes
 * nothing.
 *
 * Cross-tenant on purpose, like pruneOldStripeEvents: the WHERE clause is a
 * date and the tenant set is whatever it matches. `Notification` is FORCE RLS,
 * so under `fabrika_app` an unscoped deleteMany would see no rows, delete 0 and
 * report success while every row stayed.
 */
export async function pruneOldNotifications(
  now: Date = new Date(),
  retentionDays: number = NOTIFICATION_RETENTION_DAYS
): Promise<number> {
  return (await pruneNotificationStores(now, retentionDays)).notifications;
}

export interface PruneResult {
  notifications: number;
  /** NotificationEmailItem rows sent (sentAt) before the window. Queued rows are never touched. */
  sentEmails: number;
}

/**
 * pruneOldNotifications plus the e-mail outbox's SENT rows (NG-43): a sent row
 * is kept only as the e-mail dedupe record, for the same window counted from
 * `sentAt`. An unsent row stays whatever its age: it is a mail still owed.
 * One system-scope transaction for both.
 */
export async function pruneNotificationStores(
  now: Date = new Date(),
  retentionDays: number = NOTIFICATION_RETENTION_DAYS
): Promise<PruneResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return withSystemScope('cross-tenant-job', 'notifications-retention.prune', async (tx) => {
    const notifications = await tx.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const sentEmails = await tx.notificationEmailItem.deleteMany({ where: { sentAt: { lt: cutoff } } });
    return { notifications: notifications.count, sentEmails: sentEmails.count };
  });
}

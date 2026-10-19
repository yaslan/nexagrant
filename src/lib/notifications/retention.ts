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
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await withSystemScope('cross-tenant-job', 'notifications-retention.prune', (tx) =>
    tx.notification.deleteMany({ where: { createdAt: { lt: cutoff } } })
  );
  return result.count;
}

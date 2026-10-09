import { withSystemScope } from '@/lib/system-scope';

/**
 * Retention window for Stripe event log entries.
 * 30 days exceeds the 24h idempotency window and allows for forensics and replay debugging.
 */
export const STRIPE_EVENT_RETENTION_DAYS = 30;

/**
 * Prunes StripeEventLog entries older than the retention window.
 * Pure function: no side effects beyond database mutations.
 * Idempotent: re-running the same hour deletes nothing (WHERE clause filters by date).
 *
 * Cross-tenant on purpose: the nightly cron sweeps every tenant's log by age, so
 * the tenant set is whatever the WHERE clause matches — there is no tenant to
 * hand withTenant. `StripeEventLog` is RLS-protected, so under `fabrika_app`
 * an unscoped deleteMany sees no rows, deletes nothing and reports 0 as success
 * (TASK-MULQKFER4MF0Y).
 *
 * @returns count of deleted entries
 */
export async function pruneOldStripeEvents(retentionDays: number = STRIPE_EVENT_RETENTION_DAYS): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await withSystemScope('cross-tenant-job', 'stripe-event-retention.prune', (tx) =>
    tx.stripeEventLog.deleteMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
    })
  );

  return result.count;
}

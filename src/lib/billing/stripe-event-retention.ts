import { prisma } from '@/lib/db';

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
 * @returns count of deleted entries
 */
export async function pruneOldStripeEvents(retentionDays: number = STRIPE_EVENT_RETENTION_DAYS): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.stripeEventLog.deleteMany({
    where: {
      processedAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}

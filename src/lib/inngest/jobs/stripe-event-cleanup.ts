import { inngest } from '../client';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { pruneOldStripeEvents, STRIPE_EVENT_RETENTION_DAYS } from '@/lib/billing/stripe-event-retention';

/**
 * Stripe Event Log cleanup — nightly pruning.
 * Deletes webhook event log entries older than 30 days.
 *
 * Retention is set to 30 days (well beyond the 24h idempotency window)
 * to allow for forensics and replay debugging if a webhook processing fails.
 *
 * Runs daily at 2 AM UTC. Sweeps every tenant's log, so the delete runs under
 * withSystemScope('cross-tenant-job') — see pruneOldStripeEvents.
 * Idempotent: re-running the same hour deletes nothing (WHERE clause filters by date).
 */
export const stripeEventCleanup = inngest.createFunction(
  { id: 'stripe-event-cleanup', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }) => {
    try {
      const deletedCount = await step.run('delete-old-events', async () => {
        return await pruneOldStripeEvents();
      });

      if (deletedCount > 0) {
        await step.run('record-cleanup-stat', async () => {
          await recordAlert({
            level: 'info',
            source: 'stripe-event-cleanup',
            message: `Deleted ${deletedCount} Stripe event log entries older than ${STRIPE_EVENT_RETENTION_DAYS} days`,
            meta: {
              deletedCount,
              retentionDays: STRIPE_EVENT_RETENTION_DAYS,
            },
          });
        });
      }

      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      await step.run('record-error-alert', async () => {
        await recordAlert({
          level: 'error',
          source: 'stripe-event-cleanup',
          message: `Stripe event log cleanup failed: ${errorMessage(error)}`,
        });
      });
      throw error;
    }
  }
);

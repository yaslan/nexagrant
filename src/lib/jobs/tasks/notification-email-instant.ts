import { defineJob } from '../define';
import { runNotificationEmailOutbox } from '@/lib/notifications/run-email-outbox';

/**
 * Notification e-mail outbox, INSTANT run (NG-131, NG-43 Ö-1).
 *
 * Sends the NotificationEmailItem rows queued with frequency INSTANT
 * (src/lib/notifications/email-outbox.ts). Both modes share the
 * `notification-email` queue and the outbox claims its rows, so overlapping runs
 * (cron beside a hand-added job, two workers) mail a recipient once.
 * The tick's time bounds what is sent; a job added by hand uses now.
 * A failed send is a `warn` SystemAlert, a broken run an `error` one and a retry.
 */
export const notificationEmailInstantTask = defineJob('notification-email-instant', async ({ tick }) => {
  const result = await runNotificationEmailOutbox({ mode: 'INSTANT', ...(tick ? { now: tick } : {}) });
  return { success: !('skipped' in result), ...result };
});

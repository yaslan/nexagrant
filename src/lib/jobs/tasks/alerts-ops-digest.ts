import { defineJob } from '../define';
import { runAlertsOpsDigest } from '@/lib/observability/alerts-ops-digest';

/**
 * Alerts ops digest — hourly at :20 UTC (FO-246, RELEASE_CHECKLIST §5.2).
 *
 * Mails the recipient in ALERTS_OPS_EMAIL one summary of the `error`
 * SystemAlerts that are new, or have repeated enough, since the last digest.
 * Nothing new, no recipient or no SMTP = no mail. A failed send is reported as
 * `success: false` (logged, not retried: the next tick is an hour away and the
 * rows are still unstamped) and never throws or raises an `error` alert of its
 * own — see the module header for why that would loop.
 */
export const alertsOpsDigestTask = defineJob('alerts-ops-digest', async () => {
  const result = await runAlertsOpsDigest();
  return { success: result.outcome !== 'send_failed', ...result };
});

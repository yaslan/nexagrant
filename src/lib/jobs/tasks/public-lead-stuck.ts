import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { publicLeadStuckAfterMinutes } from '@/lib/env';
import { alertStuckRoutedLeads } from '@/lib/leads/stuck-leads';

/**
 * Stuck public lead check — every 15 minutes (NG-182).
 *
 * Finds routed PublicLeads that have no copy in their tenant after PUBLIC_LEAD_STUCK_AFTER_MINUTES
 * and opens ONE SystemAlert per such lead (a second run opens none); see src/lib/leads/stuck-leads.ts.
 * Read-only on the leads: nothing is re-routed, copied or deleted. The moment is the cron tick, not
 * the payload, so a job added by hand checks exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once (a silent check is the problem this job exists
 * for) and the queue retries it. Counts only in the result; no contact data, no tenant id.
 */
export const publicLeadStuckTask = defineJob('public-lead-stuck', async ({ tick }) => {
  try {
    const result = await alertStuckRoutedLeads({ olderThanMinutes: publicLeadStuckAfterMinutes(), now: tick ?? new Date() });
    return { success: true, ...result };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'public-lead-stuck-job',
      message: `Stuck public lead check failed: ${errorMessage(error)}`,
      meta: { olderThanMinutes: publicLeadStuckAfterMinutes() },
    });
    throw error;
  }
});

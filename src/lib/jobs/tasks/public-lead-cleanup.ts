import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { PUBLIC_LEAD_RETENTION_DAYS, purgeOldPublicLeads } from '@/lib/leads/public-lead';

/**
 * Public lead cleanup — nightly, 3:45 AM UTC (TASK-MULR765AR5G0C).
 *
 * Deletes contact requests left on the readiness result screen more than
 * PUBLIC_LEAD_RETENTION_DAYS ago (docs/legal/processing-register.md §18d). A
 * purge that deleted anything writes one `public_lead.purged` AuditEvent with
 * the count; no name or address is written anywhere. The window is not taken
 * from the payload: a job added by hand purges exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once — a retention promise that
 * silently stops being kept is what this job exists to prevent — and the queue
 * retries it (ADR-0008 §6.3).
 */
// The body never reads the tick (NG-375, NG-366 sec-gnd B-1): the purge counts back
// from the real clock, so a cron tick in the payload cannot move the cutoff.
export const publicLeadCleanupTask = defineJob('public-lead-cleanup', async () => {
  try {
    const result = await purgeOldPublicLeads();
    return { success: true, ...result };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'public-lead-cleanup',
      message: `Public lead cleanup failed: ${errorMessage(error)}`,
      meta: { retentionDays: PUBLIC_LEAD_RETENTION_DAYS },
    });
    throw error;
  }
});

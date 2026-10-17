import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { EXPERT_PREREG_RETENTION_DAYS } from '@/lib/expert-prereg/server/constants';
import { purgeOldExpertPreRegistrations } from '@/lib/expert-prereg/server/retention';

/**
 * Expert pre-registration cleanup — nightly, 3:55 AM UTC (FO-50, TASK-MVC91K7JYOWQC).
 *
 * Deletes pre-registrations left more than EXPERT_PREREG_RETENTION_DAYS ago, verified
 * or not, except the row that holds the highest founder number (see
 * src/lib/expert-prereg/server/retention.ts). A purge that deleted anything writes one
 * `expert_prereg.purged` AuditEvent with the count; no name or address is written
 * anywhere. The window is not taken from the payload.
 *
 * A failure writes an `error` SystemAlert at once and the queue retries it (ADR-0008 §6.3).
 */
export const expertPreRegCleanupTask = defineJob('expert-prereg-cleanup', async ({ tick }) => {
  try {
    const result = await purgeOldExpertPreRegistrations({
      now: tick ?? new Date(),
    });
    return { success: true, ...result };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'expert-prereg-cleanup',
      message: `Expert pre-registration cleanup failed: ${errorMessage(error)}`,
      meta: { retentionDays: EXPERT_PREREG_RETENTION_DAYS },
    });
    throw error;
  }
});

import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { INTERREG_UPLOAD_LIMITS } from '@/modules/m17/limits';
import { purgeExpiredInterregText } from '@/modules/m17/server/retention';

/**
 * M17 document-text retention — nightly, 3:35 AM UTC (FO-195, ADR-0010 §M17).
 *
 * Deletes the extracted text of Interreg uploads 30 days after the slot's own upload
 * (call guide and project file separately) and keeps the analysis row consistent; see
 * src/modules/m17/server/retention.ts. The moment is the cron tick, not the payload,
 * so a job added by hand deletes exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once — a retention promise that silently
 * stops being kept is what this job exists to prevent — and the queue retries it
 * (ADR-0008 §6.3). Counts only in the log and the result: never a file name or a text.
 */
export const m17TextRetentionTask = defineJob('m17-text-retention', async ({ tick }) => {
  const retentionDays = INTERREG_UPLOAD_LIMITS.textRetentionDays;
  try {
    const purged = await purgeExpiredInterregText(tick ?? new Date());
    return { success: true, ...purged, retentionDays };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'm17-text-retention',
      message: `M17 text retention failed: ${errorMessage(error)}`,
      meta: { retentionDays },
    });
    throw error;
  }
});

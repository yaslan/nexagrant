import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { releaseStaleRuns } from '@/modules/m17/server/stale-runs';

/**
 * M17 stale-run sweeper — every 15 minutes (FO-317).
 *
 * Gives back the credit reservation of an M17 run whose process died while ANALYZING and marks
 * the analysis FAILED; see src/modules/m17/server/stale-runs.ts. The moment is the cron tick,
 * not the payload, so a job added by hand releases exactly what the cron would.
 *
 * A failure writes an `error` SystemAlert at once (a tenant keeps paying for a result that never
 * came while this is down) and the queue retries it. Counts only in the log and the result.
 */
export const m17StaleRunsTask = defineJob('m17-stale-runs', async ({ tick }) => {
  try {
    const swept = await releaseStaleRuns(tick ?? new Date());
    return { success: true, ...swept };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'm17-stale-runs',
      message: `M17 stale-run sweep failed: ${errorMessage(error)}`,
    });
    throw error;
  }
});

import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { orphanSweepSince, reservationOrphanMinutes } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ORPHAN_ALERT_SOURCE, ORPHAN_SWEEP_MODULES, releaseOrphanReservations } from '@/lib/ai/reservation-orphans';

/**
 * Orphaned AI credit reservation sweep — every 15 minutes (NG-387, NG-202 B3).
 *
 * Refunds an M18 reservation that has neither a refund nor a delivery marker after
 * RESERVATION_ORPHAN_MINUTES and was created at or after ORPHAN_SWEEP_SINCE; see
 * src/lib/ai/reservation-orphans.ts. ORPHAN_SWEEP_SINCE blank: nothing is refunded, one warning is
 * logged (the result carries `skipped: 'no-cutoff'`, no alert). M17 is not swept here
 * (m17-stale-runs owns it). The moment is the cron tick, not the payload, so a job added by hand
 * refunds exactly what the cron would.
 *
 * Orphans found: ONE `warn` SystemAlert with the counts (an orphan means a process died mid-action,
 * which an operator should know about). None found: no alert. SystemAlert is outside RLS, so it
 * carries counts only — no tenant id, no refId. A failure writes an `error` SystemAlert at once
 * and the queue retries it.
 */
export const aiReservationOrphansTask = defineJob('ai-reservation-orphans', async ({ tick }) => {
  const olderThanMinutes = reservationOrphanMinutes();
  const since = orphanSweepSince();
  let swept;
  try {
    swept = await releaseOrphanReservations(tick ?? new Date(), { olderThanMinutes, since });
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: `${ORPHAN_ALERT_SOURCE}-job`,
      message: `AI reservation orphan sweep failed: ${errorMessage(error)}`,
    });
    throw error;
  }
  if (swept.skipped === 'no-cutoff') {
    logger.warn('[ai-reservation-orphans] ORPHAN_SWEEP_SINCE is not set: no orphan refunded. Set it to the NG-387 deploy time (docs/RELEASE_CHECKLIST.md).');
  }
  if (swept.released > 0) {
    await recordAlert({
      level: 'warn',
      source: ORPHAN_ALERT_SOURCE,
      message: `Refunded ${swept.released} orphaned AI credit reservations (${swept.credits} credits) older than ${olderThanMinutes} min`,
      meta: { ...swept, olderThanMinutes, modules: [...ORPHAN_SWEEP_MODULES] },
    });
  }
  return { success: true, ...swept };
});

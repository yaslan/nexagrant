import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { notifyExpiringEvidence } from '@/lib/notifications/evidence-expiring';

/**
 * Evidence expiring — daily, 05:20 UTC (08:20 Istanbul) (ADR-0011 §2.2, TASK-MUVR7HQQZVA2Z).
 *
 * Writes an EVIDENCE_EXPIRING notification for every verified document within
 * the badge's EXPIRING_SOON window (src/lib/notifications/evidence-expiring.ts).
 * Runs on the tick's time, so a backfilled or retried run draws the same line;
 * the dedupeKey makes any rerun write nothing new.
 *
 * A tenant that fails is a `warn` SystemAlert with counts only (no tenant id,
 * SystemAlert has no tenant isolation); the run itself failing is an `error`
 * and is rethrown so the queue retries it (ADR-0008 §6.3).
 */
export const evidenceExpiringTask = defineJob('evidence-expiring', async ({ tick }) => {
  let r;
  try {
    r = await notifyExpiringEvidence({ now: tick ?? new Date() });
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'evidence-expiring',
      message: `Evidence-expiring run failed: ${errorMessage(error)}`,
    });
    throw error;
  }

  if (r.tenantsFailed > 0) {
    await recordAlert({
      level: 'warn',
      source: 'evidence-expiring',
      message: `${r.tenantsFailed} of ${r.tenants} tenants failed`,
      meta: { tenantsFailed: r.tenantsFailed, tenants: r.tenants, written: r.notificationsWritten },
      dedupeKey: 'evidence-expiring:failed',
    });
  }

  // `errors` stays out of the job log's summary: failure messages can carry row data.
  return {
    success: r.tenantsFailed === 0,
    tenants: r.tenants,
    tenantsFailed: r.tenantsFailed,
    documentsDue: r.documentsDue,
    notificationsWritten: r.notificationsWritten,
    notificationsSkipped: r.notificationsSkipped,
    documentsWithoutRecipient: r.documentsWithoutRecipient,
  };
});

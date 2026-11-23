import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import {
  AGENCY_REPORT_RETENTION_MONTHS,
  agencyReportRetentionRunId,
  purgeExpiredAgencyReports,
  type AgencyReportPurgeResult,
} from '@/lib/agency/retention';

/**
 * Agency report periodic destruction — 1 January and 1 July, 5 AM UTC (NG-341, HUKUK-5 5d).
 *
 * Every agency monthly report older than 12 months is deleted together, and each agency's
 * deletion is recorded in `AgencyReportDeletionLog` (src/lib/agency/retention.ts). Twice a
 * year, not nightly: the decision is periodic destruction every 6 months (Yönetmelik md.11),
 * so a report lives between 12 and 18 months.
 *
 * The moment is the cron tick, not the payload, so a retried or backfilled tick deletes exactly
 * what the tick would have and reuses its run id. A run added by hand
 * (`pnpm jobs:enqueue -- agency-report-retention`, or `pnpm jobs:agency-report-retention`
 * without a worker) uses its own moment. Idempotent: a second run finds nothing past the cutoff.
 *
 * Runs on the `agency` queue with agency-monthly-report (06:00), so the two never overlap.
 * A failure writes an `error` SystemAlert — a retention promise that silently stops being kept
 * is what this job exists to prevent — and the queue retries it. Counts only in the alert and the
 * result: never report content.
 */
export async function runAgencyReportRetention(tick: Date | null, now = new Date()): Promise<AgencyReportPurgeResult> {
  return purgeExpiredAgencyReports(tick ?? now, agencyReportRetentionRunId(tick, now));
}

export const agencyReportRetentionTask = defineJob('agency-report-retention', async ({ tick }) => {
  const r = await runAgencyReportRetention(tick);
  if (r.failed > 0) {
    await recordAlert({
      level: 'error',
      source: 'agency-report-retention',
      message: `Agency report retention failed for ${r.failed} of ${r.agencies} agencies`,
      meta: { runId: r.runId, cutoff: r.cutoff, retentionMonths: AGENCY_REPORT_RETENTION_MONTHS, deleted: r.deleted },
    });
    throw new Error(`agency-report-retention: ${r.failed} agencies failed (${r.errors.map((e) => e.message).join('; ')})`);
  }
  return { success: true, ...r, retentionMonths: AGENCY_REPORT_RETENTION_MONTHS };
});

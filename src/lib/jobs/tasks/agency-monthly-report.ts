import { defineJob } from '../define';
import { AgencyReportPeriodError, generateAgencyReports, reportPeriod, requestedReportPeriod } from '@/lib/agency/report';
import { recordAlert } from '@/lib/observability/system-alert';
import { AgencyMonthlyReportOutputSchema, type AgencyMonthlyReportOutput } from '../events';

/**
 * Agency region report — 1st of month, 6 AM UTC (FB KAMU B3, TASK-MULRR08Y9YI77).
 *
 * One masked snapshot per live agency for the month that just closed, put in
 * the "Reports" list of the agency dashboard (src/lib/agency/report.ts). No
 * e-mail and no file: the agency views it on screen (NG-341). Reports older than 12
 * months are destroyed by agency-report-retention.
 *
 * Two ways in, one body:
 *  - the cron: the month before the tick's month (a retried or backfilled run
 *    keeps its tick, so it cannot slide into the next month);
 *  - a job added by hand with `{ period: "YYYY-MM" }` (`pnpm jobs:enqueue --
 *    agency-monthly-report --period YYYY-MM`, which replaces the old scheduler's
 *    `agency/report.generate` event of the old scheduler). Only the last closed month is accepted
 *    (TASK-MUM97IPC2QSGC): an open month would be stored half and then skipped
 *    by the cron.
 *
 * A refused period is not retried — retrying cannot make it valid — so it is
 * recorded as a warning and the job ends (the old NonRetriableError). A
 * period that already has a report is skipped, so a retry or a second trigger
 * adds nothing. The `agency` queue (src/lib/jobs/schedule.ts) runs one at a
 * time across all workers, as `concurrency: { limit: 1 }` did.
 */
export const agencyMonthlyReportTask = defineJob(
  'agency-monthly-report',
  async ({ payload, tick }): Promise<AgencyMonthlyReportOutput> => {
    const now = new Date();
    const manual = tick === null;
    let period: string;
    try {
      period = manual ? requestedReportPeriod(payload, now) : reportPeriod(tick);
    } catch (e) {
      if (!(e instanceof AgencyReportPeriodError)) throw e;
      await recordAlert({
        level: 'warn',
        source: 'agency-monthly-report',
        message: `Agency report request refused: ${e.message}`,
        meta: { requested: typeof payload.period === 'string' ? payload.period : null },
        dedupeKey: 'agency-report:period-refused',
      });
      return AgencyMonthlyReportOutputSchema.parse({
        success: false,
        period: typeof payload.period === 'string' ? payload.period : '',
        agencies: 0,
        generated: 0,
        skipped: 0,
        failed: 0,
        errors: [{ tenantId: '-', message: e.message }],
      });
    }
    const r = await generateAgencyReports(period, now);
    return AgencyMonthlyReportOutputSchema.parse({
      success: r.failed === 0,
      period,
      agencies: r.agencies,
      generated: r.generated,
      skipped: r.skipped,
      failed: r.failed,
      ...(r.errors.length > 0 ? { errors: r.errors } : {}),
    });
  }
);

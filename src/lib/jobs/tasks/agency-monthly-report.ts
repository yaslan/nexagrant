import { NonRetriableError } from 'inngest';
import { inngest } from '@/lib/inngest/client';
import { AgencyReportPeriodError, generateAgencyReports, reportPeriod, requestedReportPeriod } from '@/lib/agency/report';
import {
  AGENCY_REPORT_GENERATE_EVENT,
  AgencyMonthlyReportOutputSchema,
  type AgencyMonthlyReportOutput,
} from '../events';

/**
 * Agency region report — 1st of month, 6 AM UTC (FB KAMU B3, TASK-MULRR08Y9YI77).
 *
 * One masked snapshot per live agency for the month that just closed, put in
 * the "Reports" list of the agency dashboard (src/lib/agency/report.ts). No
 * e-mail: the agency downloads it. `agency/report.generate` runs the same step
 * by hand with `{ period: "YYYY-MM" }`, and only the last closed month is
 * accepted (TASK-MUM97IPC2QSGC): an open month would be stored half and then
 * skipped by the cron. A refused period fails the run without retries. A period
 * that already has a report is skipped, so a retry or a second trigger adds
 * nothing. One run at a time for the same reason.
 */
export const agencyMonthlyReport = inngest.createFunction(
  {
    id: 'agency-monthly-report',
    concurrency: { limit: 1 },
    triggers: [{ cron: '0 6 1 * *' }, { event: AGENCY_REPORT_GENERATE_EVENT }],
  },
  async ({ event, step }): Promise<AgencyMonthlyReportOutput> => {
    return await step.run('generate-agency-reports', async () => {
      const now = new Date();
      let period: string;
      let r;
      try {
        period = event.name === AGENCY_REPORT_GENERATE_EVENT ? requestedReportPeriod(event.data, now) : reportPeriod(now);
        r = await generateAgencyReports(period, now);
      } catch (e) {
        if (e instanceof AgencyReportPeriodError) throw new NonRetriableError(e.message, { cause: e });
        throw e;
      }
      return AgencyMonthlyReportOutputSchema.parse({
        success: r.failed === 0,
        period,
        agencies: r.agencies,
        generated: r.generated,
        skipped: r.skipped,
        failed: r.failed,
        ...(r.errors.length > 0 ? { errors: r.errors } : {}),
      });
    });
  }
);

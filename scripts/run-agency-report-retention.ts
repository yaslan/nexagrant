/**
 * Manual trigger for the agency report periodic destruction (`pnpm jobs:agency-report-retention`,
 * NG-341). Runs the exact body the scheduled job runs on 1 January and 1 July (05:00 UTC), at the
 * current moment: every agency report older than 12 months is deleted and each agency's deletion
 * is recorded in AgencyReportDeletionLog. Idempotent: a second run deletes nothing.
 *
 *   pnpm jobs:agency-report-retention
 */
import 'dotenv/config';

import { runAgencyReportRetention } from '../src/lib/jobs/tasks/agency-report-retention';

async function main() {
  console.log(`[jobs:agency-report-retention] start ${new Date().toISOString()}`);
  const result = await runAgencyReportRetention(null);
  console.log(`[jobs:agency-report-retention] ${JSON.stringify(result, null, 2)}`);
  if (result.failed > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[jobs:agency-report-retention] FAILED', e);
    process.exit(1);
  });

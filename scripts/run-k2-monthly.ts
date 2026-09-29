/**
 * Manual trigger for the K2 monthly CORDIS sync (`pnpm jobs:k2`).
 *
 * CLAUDE.md documents this command; the script behind it did not exist, so the
 * documented way to reproduce a failed monthly run was unrunnable. This is the
 * K1 runner's twin: it drives `runK2MonthlyCordis`, the exact function the
 * Inngest cron runs at 04:00 UTC on the 1st.
 *
 *   pnpm jobs:k2                          current month
 *   pnpm jobs:k2 -- --month 2026-09
 *   pnpm jobs:k2 -- --worker-url http://localhost:8000
 *
 * The worker owns every table write, so this script writes nothing itself
 * except the `RawFetch` audit row and any `SystemAlert` the run produces.
 * It exits 1 when the worker could not be reached or refused the job — that is
 * a real failure to report, not a reason to print a success line.
 */
import dotenv from 'dotenv';
dotenv.config();

import { runK2MonthlyCordis } from '../src/lib/jobs/tasks/k2-monthly-cordis';

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const month = flagValue('month');
  const workerUrl = flagValue('worker-url');

  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error(`[jobs:k2] --month must look like YYYY-MM, got "${month}"`);
    process.exit(2);
  }

  const target = month ?? new Date().toISOString().slice(0, 7);
  console.log(`[jobs:k2] start ${new Date().toISOString()} month=${target}`);

  const started = Date.now();
  const result = await runK2MonthlyCordis({
    ...(month ? { month } : {}),
    ...(workerUrl ? { workerUrl } : {}),
  });
  console.log(`[jobs:k2] ${JSON.stringify(result, null, 2)}`);
  console.log(`[jobs:k2] finished in ${Date.now() - started}ms`);

  if (!result.success) {
    console.error(
      '[jobs:k2] FAILED — the worker did not take the job. A SystemAlert was written; ' +
        'see /[locale]/admin/alerts (source=k2_monthly_cordis).'
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[jobs:k2] FAILED', e);
  process.exit(1);
});

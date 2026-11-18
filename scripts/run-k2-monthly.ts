/**
 * Manual trigger for the K2 monthly CORDIS sync (`pnpm jobs:k2`).
 *
 * Drives `runK2MonthlyCordis`, the exact function the scheduled job
 * (src/lib/jobs/schedule.ts) runs at 04:00 UTC on the 1st: the HORIZON bulk
 * import (`runCordisImport`) and then the M1 partner profiles (NG-225).
 *
 *   NODE_OPTIONS=--max-old-space-size=6144 pnpm jobs:k2
 *   NODE_OPTIONS=--max-old-space-size=6144 pnpm jobs:k2 -- --month 2026-09
 *
 * Without the larger heap the job refuses to start and writes a SystemAlert
 * (K2_MIN_HEAP_MB). An unchanged dump ends as "Zaten güncel" and exits 0.
 * It exits 1 when the import or the profiles failed; the cause is on the
 * CordisImportRun row and in a SystemAlert (source k2_cordis_import or
 * k2_monthly_cordis).
 */
import 'dotenv/config';

import { runK2MonthlyCordis } from '../src/lib/jobs/tasks/k2-monthly-cordis';

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const month = flagValue('month');

  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error(`[jobs:k2] --month must look like YYYY-MM, got "${month}"`);
    process.exit(2);
  }

  const target = month ?? new Date().toISOString().slice(0, 7);
  console.log(`[jobs:k2] start ${new Date().toISOString()} month=${target}`);

  const started = Date.now();
  const result = await runK2MonthlyCordis(month ? { month } : {});
  console.log(`[jobs:k2] ${JSON.stringify(result, null, 2)}`);
  console.log(`[jobs:k2] finished in ${Date.now() - started}ms`);

  if (!result.success) {
    console.error(
      `[jobs:k2] FAILED (${result.error ?? 'unknown'}). A SystemAlert was written; ` +
        'see /[locale]/admin/alerts (source=k2_cordis_import or k2_monthly_cordis).'
    );
    process.exit(1);
  }
  // Explicit: the Prisma pool would otherwise keep the process alive.
  process.exit(0);
}

main().catch((e) => {
  console.error('[jobs:k2] FAILED', e);
  process.exit(1);
});

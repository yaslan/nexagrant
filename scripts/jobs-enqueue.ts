/**
 * Queue one run of a scheduled job by hand (ADR-0008 §6.5):
 *
 *   pnpm jobs:enqueue -- <job-id> [--period YYYY-MM] [--month YYYY-MM] [--payload '{"k":"v"}'] [--force]
 *
 * A running `pnpm jobs:worker` picks it up. `agency-monthly-report --period`
 * replaces the old `agency/report.generate` event; only the last closed month
 * is accepted. `--force` re-queues a job whose earlier hand-added run failed
 * for good. Prints the job and whether it was added or already there.
 */
import 'dotenv/config';

import { enqueueJob, isJobId } from '../src/lib/jobs/enqueue';
import { JOB_IDS, type JobId } from '../src/lib/jobs/schedule';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const id = process.argv.slice(2).find((a): a is JobId => !a.startsWith('--') && isJobId(a));
  if (!id) {
    console.error(`usage: pnpm jobs:enqueue -- <job-id> [--period YYYY-MM] [--month YYYY-MM] [--payload JSON] [--force]\njobs: ${JOB_IDS.join(', ')}`);
    process.exit(2);
  }
  const payload: Record<string, unknown> = arg('payload') ? JSON.parse(arg('payload') as string) : {};
  if (arg('period')) payload.period = arg('period');
  if (arg('month')) payload.month = arg('month');
  const { job, added } = await enqueueJob(id, payload, { force: process.argv.includes('--force') });
  console.log(
    `[jobs] ${added ? 'queued' : 'already present (not added)'}: ${id} job=${job.id} key=${job.key} ` +
      `attempts=${job.attempts}/${job.max_attempts} run_at=${new Date(job.run_at).toISOString()}`
  );
}

main().catch((error) => {
  console.error('[jobs] enqueue failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

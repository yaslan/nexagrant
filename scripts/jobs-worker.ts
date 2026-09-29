/**
 * The scheduled-job worker (ADR-0008): `pnpm jobs:worker`.
 *
 * A long-running process next to the web app. Runs the crontab in
 * src/lib/jobs/schedule.ts (unless JOBS_CRON_ENABLED=false) and every job
 * queued by hand (`pnpm jobs:enqueue`). Start as many as you like against one
 * database; each tick still runs once. SIGINT/SIGTERM stop it after the jobs
 * in flight finish.
 */
// Side-effect import FIRST: src/lib/db.ts and src/lib/env.ts read the
// environment at load time, and `dotenv.config()` in a body would run after
// every import (TASK-MUMMQDJPXQH63).
import 'dotenv/config';

import { startJobsWorker } from '../src/lib/jobs/worker';
import { SCHEDULE } from '../src/lib/jobs/schedule';

async function main() {
  const runner = await startJobsWorker();
  console.log(`[jobs] worker up (pid ${process.pid}): ${SCHEDULE.map((j) => j.id).join(', ')}`);
  await runner.promise;
}

main().catch((error) => {
  console.error('[jobs] worker failed:', error);
  process.exit(1);
});

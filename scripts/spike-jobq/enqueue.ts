/**
 * SPIKE (TASK-MUMLFDTNQ53VJ) — the event-triggered path (today:
 * `inngest.send('agency/report.generate')`). Adds the same logical job twice
 * with one jobKey: the queue keeps ONE job, so a double-click or a retried
 * HTTP request cannot run the work twice.
 *   tsx scripts/spike-jobq/enqueue.ts 2026-08
 */
// Side-effect import: `dotenv.config()` in the body runs AFTER every import
// is evaluated, and src/lib/db.ts reads DATABASE_URL at load time.
import 'dotenv/config';

import { makeWorkerUtils } from 'graphile-worker';

async function main() {
  const month = process.argv[2] ?? '2026-08';
  const utils = await makeWorkerUtils({ connectionString: process.env.DATABASE_URL });
  try {
    const opts = { queueName: 'k2', jobKey: `k2-monthly-cordis:manual:${month}`, maxAttempts: 3 };
    const a = await utils.addJob('k2-monthly-cordis', { month }, opts);
    const b = await utils.addJob('k2-monthly-cordis', { month }, opts);
    console.log(`[enqueue] first=${a.id} second=${b.id} same=${a.id === b.id} key=${opts.jobKey}`);
  } finally {
    await utils.release();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

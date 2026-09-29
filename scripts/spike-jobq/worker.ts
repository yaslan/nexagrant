/**
 * SPIKE (TASK-MUMLFDTNQ53VJ) — graphile-worker instance running the REAL
 * `runK2MonthlyCordis` (the function the Inngest cron runs today).
 *
 *   tsx scripts/spike-jobq/worker.ts <instanceName>
 *
 * Start it twice against the same DATABASE_URL: the crontab row fires once per
 * tick in total, not once per instance (graphile-worker claims each tick in
 * `graphile_worker._private_known_crontabs` + a job_key before enqueueing).
 *   SPIKE_CRON  crontab schedule (default every minute; prod would be `0 4 1 * *`)
 * Spike branch only — never merged into dev.
 */
// Side-effect import: `dotenv.config()` in the body runs AFTER every import
// is evaluated, and src/lib/db.ts reads DATABASE_URL at load time.
import 'dotenv/config';

import { run, type Task } from 'graphile-worker';
import { runK2MonthlyCordis } from '../../src/lib/inngest/jobs/k2-monthly-cordis';
import { recordAlert } from '../../src/lib/observability/system-alert';

const instance = process.argv[2] ?? `w-${process.pid}`;
const schedule = process.env.SPIKE_CRON ?? '* * * * *';
const log = (msg: string) => console.log(`[${instance}] ${new Date().toISOString()} ${msg}`);

type Payload = { month?: string; _cron?: { ts: string; backfilled?: boolean } };

const k2MonthlyCordis: Task = async (raw, helpers) => {
  const payload = (raw ?? {}) as Payload;
  const { job } = helpers;
  // The month belongs to the scheduled tick, not to "now": a backfilled or
  // retried run still processes the month it was scheduled for.
  const month = payload.month ?? (payload._cron?.ts ?? new Date().toISOString()).slice(0, 7);
  log(`START job=${job.id} task=${job.task_identifier} attempt=${job.attempts}/${job.max_attempts} tick=${payload._cron?.ts ?? '-'} month=${month}`);

  const result = await runK2MonthlyCordis({ month, workerUrl: process.env.SPIKE_WORKER_URL });

  // Proof row + the monitoring channel ADR criterion 6 asks for: one
  // SystemAlert per run, naming the instance that ran it.
  await recordAlert({
    level: result.success ? 'info' : 'warn',
    source: 'jobq-spike',
    message: `k2-monthly-cordis job ${job.id} attempt ${job.attempts} by ${instance}: ${result.success ? 'ok' : result.message}`,
    meta: { instance, jobId: String(job.id), attempt: job.attempts, tick: payload._cron?.ts ?? null, month },
  });

  if (!result.success) {
    if (job.attempts >= job.max_attempts) {
      // Final attempt: the queue will not try again — this is the alert an
      // operator needs, the same one Inngest's failure handler would give.
      await recordAlert({
        level: 'error',
        source: 'job-queue',
        message: `k2-monthly-cordis gave up after ${job.attempts} attempts: ${result.message}`,
        meta: { jobId: String(job.id), month },
        dedupeKey: 'job-queue:k2-monthly-cordis:exhausted',
      });
    }
    log(`FAIL  job=${job.id} attempt=${job.attempts}: ${result.message}`);
    // Throwing hands the retry (exponential backoff) to the queue.
    throw new Error(result.message);
  }
  log(`DONE  job=${job.id} attempt=${job.attempts}`);
};

async function main() {
  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: 2,
    pollInterval: 1000,
    taskList: { 'k2-monthly-cordis': k2MonthlyCordis },
    // queue=k2 serialises every k2 job across ALL instances (Inngest
    // `concurrency: { limit: 1 }`); max=3 attempts; fill=2m backfills a tick
    // missed while no instance was up.
    crontab: `${schedule} k2-monthly-cordis ?id=k2-monthly-cordis&queue=k2&max=3&fill=2m\n`,
  });
  log(`up (graphile-worker, cron "${schedule}")`);
  runner.events.on('job:error', ({ job, error }) =>
    log(`event job:error job=${job.id} ${(error as Error).message}`)
  );
  await runner.promise;
}

main().catch((error) => {
  console.error(`[${instance}] fatal`, error);
  process.exit(1);
});

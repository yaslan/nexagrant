import { run, type Runner } from 'graphile-worker';
import { env, jobsCronEnabled } from '@/lib/env';
import { recordAlert } from '@/lib/observability/system-alert';
import { crontab } from './schedule';
import { taskList } from './tasks';

export interface StartJobsWorkerOptions {
  /** Overrides JOBS_CRON_ENABLED (tests, one-off runs). */
  cron?: boolean;
  concurrency?: number;
  connectionString?: string;
}

/** The worker's own connection (its `graphile_worker` schema), see JOBS_DATABASE_URL. */
export function jobsConnectionString(): string {
  const url = env.JOBS_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('JOBS_DATABASE_URL / DATABASE_URL is not set: the job worker has no database.');
  return url;
}

/**
 * Starts one graphile-worker process (ADR-0008 §4). Any number may run against
 * the same database: each cron tick is claimed once in total
 * (`_private_known_crontabs`), jobs are taken with SKIP LOCKED, and a `queue`
 * runs one job at a time across all of them. Stops cleanly on SIGINT/SIGTERM.
 */
export async function startJobsWorker(opts: StartJobsWorkerOptions = {}): Promise<Runner> {
  const cronOn = opts.cron ?? jobsCronEnabled();
  const runner = await run({
    connectionString: opts.connectionString ?? jobsConnectionString(),
    concurrency: opts.concurrency ?? Number(env.JOBS_CONCURRENCY),
    pollInterval: 2000,
    taskList,
    crontab: cronOn ? crontab() : '',
  });
  if (!cronOn) {
    console.warn('[jobs] JOBS_CRON_ENABLED=false: this worker runs queued jobs only; no cron tick is scheduled.');
    if (env.NODE_ENV === 'production') {
      await recordAlert({
        level: 'warn',
        source: 'job-queue',
        message:
          'A production job worker started with JOBS_CRON_ENABLED=false: no scheduled job runs until it is ' +
          'restarted with true (ADR-0008 §7 "Dağıtım sırası").',
        dedupeKey: 'job-queue:cron-disabled',
      });
    }
  }
  return runner;
}

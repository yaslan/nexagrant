import { recordAlert, type RecordAlertInput } from '@/lib/observability/system-alert';
import { defineJob } from '../define';
import { findMissedTicks, JOB_IDS, type KnownCrontab } from '../schedule';

/** A row of the `graphile_worker.jobs` view, the columns this check reads. */
export interface QueueJobRow {
  id: string;
  task_identifier: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  locked_at: Date | null;
}

/** graphile-worker releases a lock after 4 hours; a lock older than that is a dead worker. */
export const STUCK_AFTER_MS = 4 * 60 * 60 * 1000;

export interface QueueHealth {
  missed: ReturnType<typeof findMissedTicks>;
  exhausted: QueueJobRow[];
  stuck: QueueJobRow[];
}

/**
 * What `job-queue-health` reports (ADR-0008 §6.4, Ö-3), without the database:
 *  - a cron tick that no worker scheduled (worker down longer than `fill`);
 *  - a job that used its last attempt and still sits in the table;
 *  - a job locked longer than graphile-worker's own 4-hour lock timeout.
 */
export function assessQueue(known: readonly KnownCrontab[], jobs: readonly QueueJobRow[], now: Date): QueueHealth {
  return {
    missed: findMissedTicks(known, now),
    exhausted: jobs.filter((j) => j.locked_at === null && j.attempts >= j.max_attempts),
    stuck: jobs.filter((j) => j.locked_at !== null && now.getTime() - new Date(j.locked_at).getTime() > STUCK_AFTER_MS),
  };
}

/** The SystemAlert rows for a health result. Keys fold repeats of the same problem into one open row. */
export function healthAlerts(health: QueueHealth): RecordAlertInput[] {
  const alerts: RecordAlertInput[] = [];
  for (const m of health.missed) {
    alerts.push({
      level: 'error',
      source: 'job-queue',
      message:
        `${m.id} did not run for its ${m.tick.toISOString()} tick (last run ` +
        `${m.lastExecution?.toISOString() ?? 'never'}): no worker was up within the job's backfill window. ` +
        `Run it by hand with \`pnpm jobs:enqueue -- ${m.id}\` if that tick still matters.`,
      meta: { job: m.id, tick: m.tick.toISOString(), lastExecution: m.lastExecution?.toISOString() ?? null },
      dedupeKey: `job-queue:${m.id}:missed-tick`,
    });
  }
  for (const j of health.exhausted) {
    alerts.push({
      level: 'error',
      source: 'job-queue',
      message: `${j.task_identifier} gave up after ${j.attempts} attempts: ${j.last_error ?? 'no error recorded'}`,
      meta: { job: j.task_identifier, jobId: String(j.id) },
      // Same key the task wrapper uses, so the two writers share one row.
      dedupeKey: `job-queue:${j.task_identifier}:exhausted`,
    });
  }
  for (const j of health.stuck) {
    alerts.push({
      level: 'warn',
      source: 'job-queue',
      message: `${j.task_identifier} job ${j.id} has been locked since ${new Date(j.locked_at as Date).toISOString()}: its worker probably died`,
      meta: { job: j.task_identifier, jobId: String(j.id) },
      dedupeKey: `job-queue:${j.task_identifier}:stuck`,
    });
  }
  return alerts;
}

/**
 * Job Queue Health — hourly at :05 UTC. Reads the queue through the worker's
 * own connection (the `graphile_worker` schema is not an application table and
 * carries no tenant), writes one SystemAlert per problem.
 */
export const jobQueueHealthTask = defineJob('job-queue-health', async ({ helpers }) => {
  const { known, jobs } = await helpers.withPgClient(async (client) => {
    const k = await client.query<KnownCrontab>(
      'select identifier, known_since, last_execution from graphile_worker._private_known_crontabs where identifier = any($1::text[])',
      [[...JOB_IDS]]
    );
    const j = await client.query<QueueJobRow>(
      `select id::text as id, task_identifier, attempts, max_attempts, last_error, locked_at
         from graphile_worker.jobs
        where task_identifier = any($1::text[])
          and (attempts >= max_attempts or locked_at < now() - interval '4 hours')`,
      [[...JOB_IDS]]
    );
    return { known: k.rows, jobs: j.rows };
  });

  const health = assessQueue(known, jobs, new Date());
  for (const alert of healthAlerts(health)) await recordAlert(alert);
  return {
    success: true,
    missed: health.missed.map((m) => `${m.id}@${m.tick.toISOString()}`),
    exhausted: health.exhausted.length,
    stuck: health.stuck.length,
  };
});

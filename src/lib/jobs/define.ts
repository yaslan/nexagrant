import type { Job, JobHelpers, Task } from 'graphile-worker';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import type { JobId } from './schedule';

export interface JobContext {
  /** The job payload without graphile-worker's `_cron` field. */
  payload: Record<string, unknown>;
  /**
   * The cron tick this run belongs to, or null for a job added by hand. A
   * retried or backfilled run still carries the tick it was scheduled for, so a
   * monthly job works on the tick's month, not on "now" (ADR-0008 §3).
   */
  tick: Date | null;
  job: Job;
  helpers: JobHelpers;
}

/** `{ success: false }` is a reported failure: logged, not retried (ADR-0008 §6.3). */
function reportedFailure(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { success?: unknown }).success === false;
}

function summary(result: unknown): string {
  try {
    const text = JSON.stringify(result);
    return text === undefined ? '' : text.length > 600 ? `${text.slice(0, 600)}…` : text;
  } catch {
    return '[unserialisable result]';
  }
}

/**
 * A graphile-worker task around a job body (ADR-0008 §6.1, §6.4).
 *
 * The body is the same function the old scheduler called; only this wrapper
 * is new. A thrown error is retried by the queue with exponential backoff. On
 * the last attempt it also writes an `error` SystemAlert (`source: job-queue`)
 * before rethrowing, because the queue will not try again and nothing else
 * would tell an operator. `job-queue-health` raises the same alert from the
 * jobs table if this write itself fails.
 */
export function defineJob(id: JobId, body: (ctx: JobContext) => Promise<unknown>): Task {
  return async (rawPayload, helpers) => {
    const { job, logger } = helpers;
    const raw = (rawPayload && typeof rawPayload === 'object' ? rawPayload : {}) as Record<string, unknown>;
    const { _cron, ...payload } = raw as { _cron?: { ts?: unknown } } & Record<string, unknown>;
    const tick = parseCronTick(_cron?.ts);
    const where = `job=${job.id} attempt=${job.attempts}/${job.max_attempts} tick=${tick?.toISOString() ?? '-'}`;

    // A bad tick must not drop the run (NG-375 B-4): the body still runs, without a
    // tick, and the operator is told. Before this, a throw here skipped the body silently.
    if (_cron?.ts !== undefined && tick === null) {
      logger.error(`[${id}] unreadable _cron.ts, body runs without a tick: ${where}`);
      await recordAlert({
        level: 'warn',
        source: 'job-queue',
        message: `${id} got an unreadable cron tick; it ran without one`,
        meta: { job: id, jobId: String(job.id), rawTick: String(_cron.ts).slice(0, 64) },
        dedupeKey: `job-queue:${id}:bad-tick`,
      }).catch((alertError) => {
        logger.error(`[${id}] could not write the bad-tick SystemAlert: ${errorMessage(alertError)}`);
      });
    }

    logger.info(`[${id}] START ${where}`);
    try {
      const result = await body({ payload, tick, job, helpers });
      if (reportedFailure(result)) logger.warn(`[${id}] DONE (reported failure) ${where} ${summary(result)}`);
      else logger.info(`[${id}] DONE ${where} ${summary(result)}`);
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`[${id}] FAIL ${where}: ${message}`);
      if (job.attempts >= job.max_attempts) {
        await recordAlert({
          level: 'error',
          source: 'job-queue',
          message: `${id} gave up after ${job.attempts} attempts: ${message}`,
          meta: { job: id, jobId: String(job.id), tick: tick?.toISOString() ?? null },
          dedupeKey: `job-queue:${id}:exhausted`,
        }).catch((alertError) => {
          logger.error(`[${id}] could not write the exhausted-job SystemAlert: ${errorMessage(alertError)}`);
        });
      }
      throw error;
    }
  };
}

/**
 * Reads `_cron.ts`. A missing tick is null (a job added by hand). A present but
 * unreadable one is also null, and the caller raises a SystemAlert for it (NG-375 B-4).
 */
export function parseCronTick(ts: unknown): Date | null {
  if (typeof ts !== 'string') return null;
  const tick = new Date(ts);
  return Number.isNaN(tick.getTime()) ? null : tick;
}

/** `YYYY-MM` (UTC) of the tick, or of `now` for a run added by hand. */
export function monthOf(tick: Date | null, now: Date = new Date()): string {
  return (tick ?? now).toISOString().slice(0, 7);
}

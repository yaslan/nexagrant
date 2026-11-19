import { makeWorkerUtils, type Job } from 'graphile-worker';
import { requestedReportPeriod } from '@/lib/agency/report';
import { JOB_IDS, queueFor, SCHEDULE, type JobId } from './schedule';
import { jobsConnectionString } from './worker';
import { isPresentId } from '@/lib/required-id';

export function isJobId(value: string): value is JobId {
  return (JOB_IDS as readonly string[]).includes(value);
}

export interface EnqueueResult {
  job: Job;
  /** False when a job with the same key already existed (it was not added again). */
  added: boolean;
}

/**
 * Queue one run of a scheduled job by hand; a running worker picks it up.
 * This replaces the old scheduler's dashboard "Invoke" and the
 * `agency/report.generate` event (ADR-0008 §6.5).
 *
 * Every hand-added job has a key (`<job>:manual`, or `agency-report:<period>`)
 * and uses `unsafe_dedupe`: a second request while one is queued, running, or
 * failed for good adds nothing. The default `replace` mode would start a
 * second copy next to a running one (ADR-0008 §5 D4). To re-run a job whose
 * earlier run failed for good, pass `force`, which removes that job first
 * (only if it is not running). `replaceFailed` is the narrower form: it
 * deletes the job with this key only if it failed for good (every attempt
 * used, not running), in one statement, so a queued or running one is left
 * alone even when it replaced the failed one a moment earlier (NG-239 Ö-2).
 */
export async function enqueueJob(
  id: JobId,
  payload: Record<string, unknown> = {},
  opts: { force?: boolean; replaceFailed?: boolean; connectionString?: string; runAt?: Date } = {}
): Promise<EnqueueResult> {
  let key = `${id}:manual`;
  if (id === 'agency-monthly-report') {
    // Refuse a bad period here, synchronously, instead of queueing a job that
    // can only fail. The job checks it again when it runs.
    const period = requestedReportPeriod(payload, new Date());
    key = `agency-report:${period}`;
  } else if (id === 'g0-rescore-tenant') {
    // One key per PIC change and cursor: a repeated request adds nothing, while the rest of the
    // same change (a later cursor) is a new run (FO-384 B2).
    if (!isPresentId(payload.tenantId) || !isPresentId(payload.auditEventId)) {
      throw new Error('g0-rescore-tenant: tenantId and auditEventId are required');
    }
    const cursor = typeof payload.afterId === 'string' && payload.afterId !== '' ? payload.afterId : 'start';
    key = `g0-rescore-tenant:${String(payload.auditEventId)}:${cursor}`;
  } else if (id === 'pic-registry-retry') {
    // FO-396: one key per PIC change and attempt, so a repeated queue request adds nothing.
    if (!isPresentId(payload.tenantId) || !isPresentId(payload.auditEventId) || typeof payload.attempt !== 'number') {
      throw new Error('pic-registry-retry: tenantId, auditEventId and attempt are required');
    }
    key = `pic-registry-retry:${String(payload.auditEventId)}:${payload.attempt}`;
  } else if (id === 'evidence-scan') {
    // NG-239: one key per evidence file and attempt; an upload, a retry and the sweep asking for
    // the same attempt add one job.
    if (!isPresentId(payload.tenantId) || !isPresentId(payload.evidenceId) || typeof payload.attempt !== 'number') {
      throw new Error('evidence-scan: tenantId, evidenceId and attempt are required');
    }
    key = `evidence-scan:${String(payload.evidenceId)}:${payload.attempt}`;
  } else if (id === 'k1-embeddings' && payload.tenantId !== undefined) {
    // One key per tenant: saving a profile five times queues one embedding.
    if (!isPresentId(payload.tenantId)) throw new Error('k1-embeddings: tenantId must be a non-empty string');
    key = `k1-embeddings:profile:${payload.tenantId}`;
  }
  const maxAttempts = SCHEDULE.find((j) => j.id === id)?.maxAttempts ?? 5;
  const utils = await makeWorkerUtils({ connectionString: opts.connectionString ?? jobsConnectionString() });
  try {
    await utils.migrate();
    if (opts.force) {
      await utils.withPgClient((c) =>
        c.query('select graphile_worker.remove_job($1) from graphile_worker.jobs where key = $1 and locked_at is null', [key])
      );
    } else if (opts.replaceFailed) {
      // One statement, no fallback (NG-239 Ö-2). `remove_job` runs its own statements after the
      // row was picked: if another request replaced the failed job meanwhile and a worker locked
      // the new one, `remove_job` cannot delete it and instead clears its key and uses up its
      // attempts, so the running job loses its retry and a second copy gets queued. A plain
      // DELETE re-checks the condition on the row it would delete and leaves it otherwise.
      await utils.withPgClient((c) =>
        c.query(
          'delete from graphile_worker._private_jobs where key = $1 and locked_at is null and attempts >= max_attempts',
          [key]
        )
      );
    }
    const existing = await utils.withPgClient((c) =>
      c.query<{ id: string }>('select id::text as id from graphile_worker.jobs where key = $1', [key])
    );
    const queueName = queueFor(id);
    const job = await utils.addJob(id, payload, {
      jobKey: key,
      jobKeyMode: 'unsafe_dedupe',
      maxAttempts,
      ...(queueName ? { queueName } : {}),
      ...(opts.runAt ? { runAt: opts.runAt } : {}),
    });
    return { job, added: existing.rows.length === 0 };
  } finally {
    await utils.release();
  }
}

/**
 * Queue a re-embedding of one tenant's profile (TASK-MUN7C48UHPOGI). Call it
 * after a profile save commits; the request itself never calls the provider.
 * Repeated saves while one is queued add nothing (one key per tenant), and the
 * job embeds only if the profile text actually changed (content hash).
 */
export async function enqueueTenantProfileEmbedding(
  tenantId: string,
  opts: { connectionString?: string } = {}
): Promise<EnqueueResult> {
  if (!isPresentId(tenantId)) throw new Error('enqueueTenantProfileEmbedding: tenantId is missing');
  return enqueueJob('k1-embeddings', { tenantId }, opts);
}

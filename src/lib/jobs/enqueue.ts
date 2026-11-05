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
 * (only if it is not running).
 */
export async function enqueueJob(
  id: JobId,
  payload: Record<string, unknown> = {},
  opts: { force?: boolean; connectionString?: string } = {}
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

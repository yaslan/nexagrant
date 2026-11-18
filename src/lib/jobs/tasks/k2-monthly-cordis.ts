import crypto from 'crypto';
import { defineJob, monthOf } from '../define';
import { env } from '@/lib/env';
import { recordAlert } from '@/lib/observability/system-alert';
import { recordRawFetch } from '@/lib/k2-cordis/raw-fetch';
import { K2MonthlyCordisOutputSchema, type K2MonthlyCordisOutput } from '../events';

/** Heap floor (MB) the in-process import needs; filled in by the NG-225 fix. */
export const K2_MIN_HEAP_MB = 6144;

/** `YYYY-MM` for the month a run belongs to. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface K2MonthlyCordisOptions {
  /** `YYYY-MM`; defaults to the current UTC month. */
  month?: string;
  /** Override for tests and for pointing a manual run at another worker. */
  workerUrl?: string;
}

/** The one field the job needs the worker to keep sending. */
const REQUIRED_WORKER_FIELDS = ['message'] as const;

/**
 * Ask the Python worker to run the monthly CORDIS pipeline.
 *
 * Split out of the job wrapper so `pnpm jobs:k2` and the unit tests drive the
 * exact same path — the same shape `syncK1Topics` has.
 *
 * CLAUDE.md rule 6 in three parts, all of which this used to miss:
 *  - the raw answer is written to `RawFetch` (keyed on its own hash, so a
 *    repeat run against an unchanged answer adds no row);
 *  - an unreachable worker, a non-2xx, or a body that is not JSON produces a
 *    `SystemAlert` and a `success: false` result — it never throws;
 *  - a body that no longer carries a field this job reads is *drift*, not
 *    failure: it alerts and the run still counts as delivered.
 *
 * And the one the worker side pays for: `/jobs/cordis` runs the pipeline before
 * it answers, so `success: false` in a 2xx body is a real failure and is
 * recorded as one. A worker that reports a broken run no longer produces a
 * green K2 result.
 */
export async function runK2MonthlyCordis(
  options: K2MonthlyCordisOptions = {}
): Promise<K2MonthlyCordisOutput> {
  const month = options.month ?? currentMonth();
  const workerUrl = options.workerUrl || env.WORKER_URL || 'http://localhost:8000';
  const workerToken = env.WORKER_TOKEN || '';
  const endpoint = `${workerUrl}/jobs/cordis?month=${encodeURIComponent(month)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to reach the CORDIS worker';
    // `workerUrl` can carry a token in userinfo; only the host is safe to log.
    await recordAlert({
      level: 'error',
      source: 'k2_monthly_cordis',
      message: `CORDIS worker unreachable: ${msg}`,
      meta: { month, host: safeHost(workerUrl) },
      // `month` is this job's run identifier, not part of what is wrong: a
      // worker that is down in September is the same outage in October, and
      // it is why every K2 alert opened a fresh row every month. The host
      // stays in the key because two hosts are two outages. Resolving the
      // alert still reopens the window, so a fixed-then-broken-again worker
      // is not hidden behind a counter.
      dedupeKey: `k2:worker-unreachable:${safeHost(workerUrl)}`,
    });
    return K2MonthlyCordisOutputSchema.parse({ success: false, message: msg, error: msg });
  }

  // Read as text first: a worker that answers with an HTML error page must not
  // turn into an exception before the answer has been recorded.
  const bodyText = await response.text().catch(() => '');
  const hash = crypto.createHash('sha256').update(`${response.status}:${bodyText}`).digest('hex');

  const rawFetch = await recordRawFetch({
    source: 'cordis_worker',
    key: month,
    hash,
    storageUrl: endpoint,
    payload: {
      month,
      status: response.status,
      contentType: response.headers.get('content-type'),
      // Bounded on purpose: this is an audit trail, not a body store.
      body: bodyText.slice(0, 8000),
      truncated: bodyText.length > 8000,
    },
  });

  if (!response.ok) {
    const message = `Worker responded with status ${response.status}`;
    await recordAlert({
      level: 'warn',
      source: 'k2_monthly_cordis',
      message: `CORDIS worker returned HTTP ${response.status}`,
      meta: { month, host: safeHost(workerUrl), status: response.status, rawFetch: rawFetch.status },
      // The status code is the problem — a 401 is a credential to fix and a
      // 503 is a wait — so it is in the key alongside the host. `month` and
      // the RawFetch outcome are per-run bookkeeping.
      dedupeKey: `k2:worker-http:${safeHost(workerUrl)}:${response.status}`,
    });
    return K2MonthlyCordisOutputSchema.parse({
      success: false,
      message,
      statusCode: response.status,
      error: `HTTP ${response.status}`,
    });
  }

  let workerResponse: unknown;
  try {
    workerResponse = JSON.parse(bodyText);
  } catch {
    const message = 'CORDIS worker answered 2xx with a body that is not JSON';
    await recordAlert({
      level: 'warn',
      source: 'k2_monthly_cordis',
      message,
      meta: { month, host: safeHost(workerUrl), contentType: response.headers.get('content-type') },
      // Deliberately not keyed on `contentType`: an error page served as
      // text/html one run and text/plain the next is the same defect, and
      // folding them is the point. Host in, month out.
      dedupeKey: `k2:worker-body-not-json:${safeHost(workerUrl)}`,
    });
    return K2MonthlyCordisOutputSchema.parse({ success: false, message, error: message });
  }

  // Schema drift: a field this job reads stopped arriving. Alert, do not break —
  // the pipeline on the worker side was still triggered.
  const missing = REQUIRED_WORKER_FIELDS.filter(
    (field) =>
      typeof workerResponse !== 'object' ||
      workerResponse === null ||
      !(field in (workerResponse as Record<string, unknown>))
  );

  if (missing.length > 0) {
    await recordAlert({
      level: 'warn',
      source: 'k2_monthly_cordis',
      message: 'CORDIS worker response is missing fields this job expects',
      meta: { month, missingFields: missing, host: safeHost(workerUrl) },
      // The set of absent fields is the contract change an operator has to
      // answer; a further field dropping out next month is genuinely a new
      // alert. Sorted so the key cannot fork on ordering.
      dedupeKey: `k2:worker-missing-fields:${[...missing].sort().join(',')}`,
    });
  }

  // The worker now runs the pipeline before it answers, so a 2xx body carries
  // the *outcome*. When it says the run failed, this job must not record a
  // success: a green K2 run with an empty CordisProject table was exactly the
  // failure this path used to hide.
  const reported = workerResponse as Record<string, unknown>;
  if (reported?.success === false) {
    const detail = typeof reported.error === 'string' ? reported.error : 'unknown error';
    const message = `CORDIS pipeline failed on the worker: ${detail}`;
    await recordAlert({
      level: 'error',
      source: 'k2_monthly_cordis',
      message,
      meta: { month, host: safeHost(workerUrl), rowCounts: reported.rowCounts ?? null },
      // `rowCounts` differs on every run by construction and the failure
      // detail is free text from the worker; both are display, not identity.
      dedupeKey: `k2:pipeline-failed:${safeHost(workerUrl)}`,
    });
    return K2MonthlyCordisOutputSchema.parse({
      success: false,
      message,
      workerResponse,
      error: detail,
    });
  }

  return K2MonthlyCordisOutputSchema.parse({
    success: true,
    message: 'CORDIS pipeline finished successfully',
    workerResponse,
  });
}

/** Host only — a worker URL may embed credentials, and `SystemAlert` has no RLS. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-worker-url';
  }
}

/**
 * K2 Monthly CORDIS Sync — 1st of month, 04:00 UTC.
 * Triggers the Python worker, which does the DuckDB transform and the upsert.
 * The month is the tick's month (a retried or backfilled run keeps it), or
 * `payload.month` for a run added by hand. Never throws, so the queue never
 * retries it — the same as under the old scheduler (ADR-0008 §6.3).
 */
export const k2MonthlyCordisTask = defineJob('k2-monthly-cordis', async ({ payload, tick }): Promise<K2MonthlyCordisOutput> => {
  const month = typeof payload.month === 'string' ? payload.month : monthOf(tick);
  return runK2MonthlyCordis({ month });
});

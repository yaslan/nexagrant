import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The run itself is pinned in src/lib/scoring/embeddings.test.ts and
// tests/k1-embeddings.live.test.ts; here only the job wrapper (payload, alerts,
// log summary) and the key a profile save is queued under.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const runK1Embeddings = vi.fn();
vi.mock('@/lib/scoring/embeddings', () => ({ runK1Embeddings }));
const addJob = vi.fn(async () => ({ id: '1' }));
vi.mock('graphile-worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('graphile-worker')>()),
  makeWorkerUtils: vi.fn(async () => ({
    migrate: async () => {},
    withPgClient: async () => ({ rows: [] }),
    addJob,
    release: async () => {},
  })),
}));

const { env } = await import('@/lib/env');
const { k1EmbeddingsTask } = await import('../k1-embeddings');
const { enqueueTenantProfileEmbedding, enqueueJob } = await import('@/lib/jobs/enqueue');

const infos: string[] = [];
function helpersFor(attempts = 1): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: 5 } as unknown as JobHelpers['job'],
    logger: { info: (m: string) => infos.push(m), warn: (m: string) => infos.push(m), error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}
const result = (over: Record<string, unknown> = {}) => ({
  topicsScanned: 3, topicsEmbedded: 3, topicsUpToDate: 0, topicsEmpty: 0, profilesScanned: 1, profilesEmbedded: 1,
  profilesUpToDate: 0, profilesEmpty: 0, profilesPilotExpired: 0, rejected: 0, previouslyRejected: 0, shortened: 0, raced: 0, failed: 0, estimatedUsd: 0.0002,
  maxUsd: 0.05, budgetExhausted: false, aborted: false, requestRefused: false, errors: [], durationMs: 5, ...over,
});
const TICK = '2026-10-01T02:15:00.000Z';

beforeEach(() => {
  alerts.length = 0;
  infos.length = 0;
  runK1Embeddings.mockReset();
  addJob.mockClear();
  env.NODE_ENV = 'test';
});

describe('k1-embeddings job', () => {
  it('the cron sweep runs on the tick with no tenant, and a clean run alerts nothing', async () => {
    runK1Embeddings.mockResolvedValue(result());
    await k1EmbeddingsTask({ _cron: { ts: TICK } }, helpersFor());
    expect(runK1Embeddings).toHaveBeenCalledWith({ tenantId: undefined, now: new Date(TICK) });
    expect(alerts).toEqual([]);
    expect(infos.some((m) => m.includes('"success":true') && m.includes('"topicsEmbedded":3'))).toBe(true);
  });

  it('a profile job passes its tenant through', async () => {
    runK1Embeddings.mockResolvedValue(result());
    await k1EmbeddingsTask({ tenantId: 't-1' }, helpersFor());
    expect(runK1Embeddings.mock.calls[0]![0]).toMatchObject({ tenantId: 't-1' });
  });

  it('refuses an empty tenant id in the payload', async () => {
    await expect(k1EmbeddingsTask({ tenantId: '' }, helpersFor())).rejects.toThrow();
    expect(runK1Embeddings).not.toHaveBeenCalled();
  });

  it('failures are a warn with counts; provider messages stay out of the alert and the log summary', async () => {
    runK1Embeddings.mockResolvedValue(result({ failed: 3, aborted: true, errors: ['OpenAI embeddings error 401: secret-body'] }));
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts.map((a) => a.dedupeKey)).toEqual(['k1-embeddings:failed']);
    expect(JSON.stringify(alerts)).not.toContain('secret-body');
    expect(infos.join('\n')).not.toContain('secret-body');
    expect(infos.some((m) => m.includes('"success":false'))).toBe(true);
  });

  it('refused rows are named in the warn as skipped, and the output carries the counts', async () => {
    runK1Embeddings.mockResolvedValue(result({ failed: 2, rejected: 2, previouslyRejected: 1, shortened: 1 }));
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts).toEqual([expect.objectContaining({ level: 'warn', dedupeKey: 'k1-embeddings:failed', meta: expect.objectContaining({ rejected: 2 }) })]);
    expect(String(alerts[0]!.message)).toContain('2 rows refused, now skipped');
    expect(infos.some((m) => m.includes('"rejected":2') && m.includes('"previouslyRejected":1') && m.includes('"shortened":1'))).toBe(true);
  });

  it('a refused request says so in the warn: no row was marked (İNCELEME-85 Y-1)', async () => {
    runK1Embeddings.mockResolvedValue(result({ failed: 2, aborted: true, requestRefused: true }));
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts).toEqual([expect.objectContaining({ level: 'warn', dedupeKey: 'k1-embeddings:failed', meta: expect.objectContaining({ requestRefused: true }) })]);
    expect(String(alerts[0]!.message)).toContain('refused the request itself');
    expect(String(alerts[0]!.message)).not.toContain('rows refused');
    expect(infos.some((m) => m.includes('"requestRefused":true') && m.includes('"success":false'))).toBe(true);
  });

  it('the cap is an info alert, and the run still counts as a success', async () => {
    runK1Embeddings.mockResolvedValue(result({ budgetExhausted: true }));
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts).toEqual([expect.objectContaining({ level: 'info', dedupeKey: 'k1-embeddings:budget' })]);
    expect(infos.some((m) => m.includes('"success":true'))).toBe(true);
  });

  it('a missing key is reported in production only', async () => {
    runK1Embeddings.mockResolvedValue(result({ skipped: 'no_api_key', topicsEmbedded: 0, profilesEmbedded: 0 }));
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts).toEqual([]);
    env.NODE_ENV = 'production';
    await k1EmbeddingsTask({}, helpersFor());
    expect(alerts.map((a) => a.dedupeKey)).toEqual(['k1-embeddings:no-api-key']);
  });
});

describe('enqueueTenantProfileEmbedding', () => {
  it('queues one deduplicated job per tenant on the k1-embeddings queue', async () => {
    await enqueueTenantProfileEmbedding('t-1', { connectionString: 'postgres://x' });
    expect(addJob).toHaveBeenCalledWith('k1-embeddings', { tenantId: 't-1' }, expect.objectContaining({
      jobKey: 'k1-embeddings:profile:t-1', jobKeyMode: 'unsafe_dedupe', queueName: 'k1-embeddings',
    }));
  });

  it('the sweep keeps the manual key', async () => {
    await enqueueJob('k1-embeddings', {}, { connectionString: 'postgres://x' });
    expect(addJob).toHaveBeenCalledWith('k1-embeddings', {}, expect.objectContaining({ jobKey: 'k1-embeddings:manual' }));
  });

  it('refuses a missing tenant id before touching the queue', async () => {
    await expect(enqueueTenantProfileEmbedding('', { connectionString: 'postgres://x' })).rejects.toThrow('tenantId is missing');
    await expect(enqueueJob('k1-embeddings', { tenantId: '' }, { connectionString: 'postgres://x' })).rejects.toThrow();
    expect(addJob).not.toHaveBeenCalled();
  });
});

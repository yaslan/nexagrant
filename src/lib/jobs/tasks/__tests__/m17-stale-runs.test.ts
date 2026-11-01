import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The sweep itself is pinned against Postgres in tests/m17-stale-runs.live.test.ts;
// here only the job around it: which moment it sweeps by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const releaseStaleRuns = vi.fn();
vi.mock('@/modules/m17/server/stale-runs', () => ({ releaseStaleRuns }));

const { m17StaleRunsTask } = await import('../m17-stale-runs');

const logged: string[] = [];

function helpersFor(attempts = 1, maxAttempts = 3): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: {
      info: (m: string) => logged.push(m),
      warn: noop,
      error: noop,
      debug: noop,
    } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  logged.length = 0;
  releaseStaleRuns.mockReset();
});

describe('m17-stale-runs job', () => {
  it('sweeps by the cron tick and returns only counts; a payload cannot move the moment', async () => {
    releaseStaleRuns.mockResolvedValue({ released: 2, more: false });
    await m17StaleRunsTask({ _cron: { ts: '2026-11-01T10:15:00.000Z' }, now: '2030-01-01' }, helpersFor());
    expect(releaseStaleRuns).toHaveBeenCalledWith(new Date('2026-11-01T10:15:00.000Z'));
    const done = logged.find((m) => m.includes('DONE'));
    expect(done).toContain('{"success":true,"released":2,"more":false}');
    expect(alerts).toEqual([]);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    releaseStaleRuns.mockRejectedValue(new Error('connection reset'));
    await expect(m17StaleRunsTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      { level: 'error', source: 'm17-stale-runs', message: 'M17 stale-run sweep failed: connection reset' },
    ]);
  });
});

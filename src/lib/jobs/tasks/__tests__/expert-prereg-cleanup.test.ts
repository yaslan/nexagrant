import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The purge itself is pinned against Postgres in tests/expert-prereg-retention.live.test.ts;
// here only the job around it: which moment it purges by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeOldExpertPreRegistrations = vi.fn();
vi.mock('@/lib/expert-prereg/server/retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/expert-prereg/server/retention')>()),
  purgeOldExpertPreRegistrations,
}));

const { expertPreRegCleanupTask } = await import('../expert-prereg-cleanup');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: {
      id: '7',
      attempts,
      max_attempts: maxAttempts,
    } as unknown as JobHelpers['job'],
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  purgeOldExpertPreRegistrations.mockReset();
});

describe('expert-prereg-cleanup job', () => {
  it('purges by the cron tick, not by the moment the worker got round to it', async () => {
    purgeOldExpertPreRegistrations.mockResolvedValue({
      deletedCount: 2,
      cutoff: 'x',
      retentionDays: 365,
    });
    await expertPreRegCleanupTask({ _cron: { ts: '2026-10-01T03:55:00.000Z' } }, helpersFor());
    expect(purgeOldExpertPreRegistrations).toHaveBeenCalledWith({
      now: new Date('2026-10-01T03:55:00.000Z'),
    });
    expect(alerts).toEqual([]);
  });

  it('does not let a hand-added payload widen the window', async () => {
    purgeOldExpertPreRegistrations.mockResolvedValue({
      deletedCount: 0,
      cutoff: 'x',
      retentionDays: 365,
    });
    await expertPreRegCleanupTask({ retentionDays: 0 }, helpersFor());
    expect(Object.keys(purgeOldExpertPreRegistrations.mock.calls[0]?.[0] ?? {})).toEqual(['now']);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    purgeOldExpertPreRegistrations.mockRejectedValue(new Error('connection reset'));
    await expect(expertPreRegCleanupTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'expert-prereg-cleanup',
        message: 'Expert pre-registration cleanup failed: connection reset',
        meta: { retentionDays: 365 },
      },
    ]);
  });
});

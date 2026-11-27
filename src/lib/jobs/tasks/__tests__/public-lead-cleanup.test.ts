import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The purge itself is pinned against Postgres in tests/public-lead.live.test.ts;
// here only the job around it: which moment it purges by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeOldPublicLeads = vi.fn();
vi.mock('@/lib/leads/public-lead', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/public-lead')>()),
  purgeOldPublicLeads,
}));

const { publicLeadCleanupTask } = await import('../public-lead-cleanup');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '7', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  purgeOldPublicLeads.mockReset();
});

describe('public-lead-cleanup job', () => {
  it('a cron tick in the future (2099) does not move the cutoff: the purge gets no moment (NG-375 B-1)', async () => {
    purgeOldPublicLeads.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 365 });
    await publicLeadCleanupTask({ _cron: { ts: '2099-01-01T03:45:00.000Z' } }, helpersFor());
    expect(purgeOldPublicLeads).toHaveBeenCalledTimes(1);
    expect(purgeOldPublicLeads.mock.calls[0]).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it('does not let a hand-added payload widen the window', async () => {
    purgeOldPublicLeads.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 365 });
    await publicLeadCleanupTask({ retentionDays: 0 }, helpersFor());
    expect(purgeOldPublicLeads).toHaveBeenCalledTimes(1);
    expect(purgeOldPublicLeads.mock.calls[0]).toEqual([]);
  });

  it('an unreadable cron tick raises a bad-tick SystemAlert and the purge still runs (NG-375 B-4)', async () => {
    purgeOldPublicLeads.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 365 });
    await publicLeadCleanupTask({ _cron: { ts: 'garbage' } }, helpersFor());
    expect(purgeOldPublicLeads).toHaveBeenCalledTimes(1);
    expect(alerts.map((a) => [a.source, a.dedupeKey ?? null])).toEqual([['job-queue', 'job-queue:public-lead-cleanup:bad-tick']]);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    purgeOldPublicLeads.mockRejectedValue(new Error('connection reset'));
    await expect(publicLeadCleanupTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'public-lead-cleanup',
        message: 'Public lead cleanup failed: connection reset',
        meta: { retentionDays: 365 },
      },
    ]);
  });

  it('on the last attempt the wrapper adds the exhausted-job alert', async () => {
    purgeOldPublicLeads.mockRejectedValue(new Error('connection reset'));
    await expect(publicLeadCleanupTask({}, helpersFor(5, 5))).rejects.toThrow();
    expect(alerts.map((a) => [a.source, a.dedupeKey ?? null])).toEqual([
      ['public-lead-cleanup', null],
      ['job-queue', 'job-queue:public-lead-cleanup:exhausted'],
    ]);
  });
});

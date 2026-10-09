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
  it('purges by the cron tick, not by the moment the worker got round to it', async () => {
    purgeOldPublicLeads.mockResolvedValue({ deletedCount: 2, cutoff: 'x', retentionDays: 365 });
    await publicLeadCleanupTask({ _cron: { ts: '2026-10-01T03:30:00.000Z' } }, helpersFor());
    expect(purgeOldPublicLeads).toHaveBeenCalledWith({ now: new Date('2026-10-01T03:30:00.000Z') });
    expect(alerts).toEqual([]);
  });

  it('does not let a hand-added payload widen the window', async () => {
    purgeOldPublicLeads.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 365 });
    await publicLeadCleanupTask({ retentionDays: 0 }, helpersFor());
    expect(purgeOldPublicLeads).toHaveBeenCalledTimes(1);
    expect(Object.keys(purgeOldPublicLeads.mock.calls[0]?.[0] ?? {})).toEqual(['now']);
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

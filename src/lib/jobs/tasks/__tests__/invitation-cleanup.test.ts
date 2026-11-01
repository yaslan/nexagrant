import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The purge itself is pinned against Postgres in tests/invitation-retention.live.test.ts;
// here only the job around it: which moment it purges by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeOldInvitations = vi.fn();
vi.mock('@/lib/invitations/retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invitations/retention')>()),
  purgeOldInvitations,
}));

const { invitationCleanupTask } = await import('../invitation-cleanup');
const { invitationPurgeCutoff, purgeableInvitationWhere } = await import('@/lib/invitations/retention');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '7', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  purgeOldInvitations.mockReset();
});

describe('invitation-cleanup job', () => {
  it('purges by the cron tick, not by the moment the worker got round to it', async () => {
    purgeOldInvitations.mockResolvedValue({ deletedCount: 2, tenantCount: 1, cutoff: 'x', retentionDays: 30 });
    await invitationCleanupTask({ _cron: { ts: '2026-10-01T03:30:00.000Z' } }, helpersFor());
    expect(purgeOldInvitations).toHaveBeenCalledWith({ now: new Date('2026-10-01T03:30:00.000Z') });
    expect(alerts).toEqual([]);
  });

  it('does not let a hand-added payload widen the window', async () => {
    purgeOldInvitations.mockResolvedValue({ deletedCount: 0, tenantCount: 0, cutoff: 'x', retentionDays: 30 });
    await invitationCleanupTask({ retentionDays: 0 }, helpersFor());
    expect(purgeOldInvitations).toHaveBeenCalledTimes(1);
    expect(Object.keys(purgeOldInvitations.mock.calls[0]?.[0] ?? {})).toEqual(['now']);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    purgeOldInvitations.mockRejectedValue(new Error('connection reset'));
    await expect(invitationCleanupTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'invitation-cleanup',
        message: 'Invitation cleanup failed: connection reset',
        meta: { retentionDays: 30 },
      },
    ]);
  });

  it('on the last attempt the wrapper adds the exhausted-job alert', async () => {
    purgeOldInvitations.mockRejectedValue(new Error('connection reset'));
    await expect(invitationCleanupTask({}, helpersFor(5, 5))).rejects.toThrow();
    expect(alerts.map((a) => [a.source, a.dedupeKey ?? null])).toEqual([
      ['invitation-cleanup', null],
      ['job-queue', 'job-queue:invitation-cleanup:exhausted'],
    ]);
  });
});

describe('retention rule', () => {
  it('cuts off exactly 30 days before now', () => {
    expect(invitationPurgeCutoff(new Date('2026-10-31T00:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('refuses a window or a moment that could reach pending invitations or drop the filter', () => {
    for (const days of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => invitationPurgeCutoff(new Date(), days)).toThrow(RangeError);
    }
    expect(() => invitationPurgeCutoff(new Date('nope'))).toThrow(RangeError);
    expect(() => purgeableInvitationWhere(new Date('nope'))).toThrow(RangeError);
    expect(() => purgeableInvitationWhere(undefined as unknown as Date)).toThrow(RangeError);
  });

  it('judges an accepted row by acceptedAt and an unaccepted one by expires', () => {
    const cutoff = new Date('2026-09-01T00:00:00Z');
    expect(purgeableInvitationWhere(cutoff)).toEqual({
      OR: [
        { acceptedAt: { not: null, lt: cutoff } },
        { acceptedAt: null, expires: { lt: cutoff } },
      ],
    });
  });
});

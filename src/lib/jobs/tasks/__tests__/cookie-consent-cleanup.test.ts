import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The purge itself is pinned against Postgres in tests/cookie-consent-retention.live.test.ts;
// here only the job around it: which moment it purges by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeOldCookieConsents = vi.fn();
vi.mock('@/lib/cookie-consent-retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cookie-consent-retention')>()),
  purgeOldCookieConsents,
}));

const { cookieConsentCleanupTask } = await import('../cookie-consent-cleanup');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  purgeOldCookieConsents.mockReset();
});

describe('cookie-consent-cleanup job', () => {
  it('purges by the cron tick, not by the moment the worker got round to it', async () => {
    purgeOldCookieConsents.mockResolvedValue({ deletedCount: 3, cutoff: 'x', retentionDays: 1095 });
    await cookieConsentCleanupTask({ _cron: { ts: '2026-11-27T03:40:00.000Z' } }, helpersFor());
    expect(purgeOldCookieConsents).toHaveBeenCalledWith({ now: new Date('2026-11-27T03:40:00.000Z') });
    expect(alerts).toEqual([]);
  });

  it('does not let a hand-added payload widen the window', async () => {
    purgeOldCookieConsents.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 1095 });
    await cookieConsentCleanupTask({ retentionDays: 0 }, helpersFor());
    expect(purgeOldCookieConsents).toHaveBeenCalledTimes(1);
    expect(Object.keys(purgeOldCookieConsents.mock.calls[0]?.[0] ?? {})).toEqual(['now']);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    purgeOldCookieConsents.mockRejectedValue(new Error('connection reset'));
    await expect(cookieConsentCleanupTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'cookie-consent-cleanup',
        message: 'Cookie consent cleanup failed: connection reset',
        meta: { retentionDays: 1095 },
      },
    ]);
  });
});

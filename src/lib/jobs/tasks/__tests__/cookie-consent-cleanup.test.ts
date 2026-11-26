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
  // The moment the purge counts back from, as the job hands it over: an
  // explicit `now`, or the real clock when none is passed.
  function purgeMoment(beforeCall: number): number {
    const arg = purgeOldCookieConsents.mock.calls[0]?.[0] as { now?: Date } | undefined;
    return arg?.now?.getTime() ?? beforeCall;
  }

  it('a cron tick in the future (2099) does not move the cutoff past the real clock (sec-gnd B-1)', async () => {
    purgeOldCookieConsents.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 1095 });
    const before = Date.now();
    await cookieConsentCleanupTask({ _cron: { ts: '2099-01-01T03:40:00.000Z' } }, helpersFor());
    expect(purgeOldCookieConsents).toHaveBeenCalledTimes(1);
    expect(purgeMoment(before)).toBeLessThanOrEqual(Date.now());
    expect(alerts).toEqual([]);
  });

  it('nothing in the payload reaches the purge: no tick, no retentionDays', async () => {
    purgeOldCookieConsents.mockResolvedValue({ deletedCount: 0, cutoff: 'x', retentionDays: 1095 });
    await cookieConsentCleanupTask({ _cron: { ts: '2026-11-27T03:40:00.000Z' }, retentionDays: 0 }, helpersFor());
    expect(purgeOldCookieConsents).toHaveBeenCalledTimes(1);
    expect(purgeOldCookieConsents.mock.calls[0]).toEqual([]);
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The purge itself is pinned against Postgres in tests/m17-text-retention.live.test.ts;
// here only the job around it: which moment it purges by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeExpiredInterregText = vi.fn();
vi.mock('@/modules/m17/server/retention', () => ({ purgeExpiredInterregText }));

const { m17TextRetentionTask } = await import('../m17-text-retention');

const logged: string[] = [];

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
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
  purgeExpiredInterregText.mockReset();
});

describe('m17-text-retention job', () => {
  it('purges by the cron tick, returns only counts, and a payload cannot change the window', async () => {
    purgeExpiredInterregText.mockResolvedValue({ callSlots: 2, projectSlots: 1, analyses: 3, more: false });
    await m17TextRetentionTask(
      { _cron: { ts: '2026-10-01T03:35:00.000Z' }, retentionDays: 0, now: '2030-01-01' },
      helpersFor(),
    );
    expect(purgeExpiredInterregText).toHaveBeenCalledWith(new Date('2026-10-01T03:35:00.000Z'));
    const done = logged.find((m) => m.includes('DONE'));
    expect(done).toContain('{"success":true,"callSlots":2,"projectSlots":1,"analyses":3,"more":false,"retentionDays":30}');
    expect(alerts).toEqual([]);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    purgeExpiredInterregText.mockRejectedValue(new Error('connection reset'));
    await expect(m17TextRetentionTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'm17-text-retention',
        message: 'M17 text retention failed: connection reset',
        meta: { retentionDays: 30 },
      },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The prune itself is pinned against Postgres in tests/notification-retention.live.test.ts;
// here only the job around it: which moment it prunes by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const pruneNotificationStores = vi.fn();
vi.mock('@/lib/notifications/retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/retention')>()),
  pruneNotificationStores,
}));

const { notificationsRetentionTask } = await import('../notifications-retention');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  pruneNotificationStores.mockReset();
});

describe('notifications-retention job', () => {
  it('prunes by the cron tick, and a payload cannot change the window', async () => {
    pruneNotificationStores.mockResolvedValue({ notifications: 3, sentEmails: 2 });
    await notificationsRetentionTask({ _cron: { ts: '2026-10-01T03:50:00.000Z' }, retentionDays: 0 }, helpersFor());
    expect(pruneNotificationStores).toHaveBeenCalledWith(new Date('2026-10-01T03:50:00.000Z'));
    expect(alerts).toEqual([]);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    pruneNotificationStores.mockRejectedValue(new Error('connection reset'));
    await expect(notificationsRetentionTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      {
        level: 'error',
        source: 'notifications-retention',
        message: 'Notification retention failed: connection reset',
        meta: { retentionDays: 90 },
      },
    ]);
  });
});

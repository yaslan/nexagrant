import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The producer itself is pinned against Postgres in tests/evidence-expiring.live.test.ts;
// here only the job around it: which moment it runs by, and what a failure leaves behind.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const notifyExpiringEvidence = vi.fn();
vi.mock('@/lib/notifications/evidence-expiring', () => ({ notifyExpiringEvidence }));

const { evidenceExpiringTask } = await import('../evidence-expiring');

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

const clean = {
  tenants: 2, tenantsFailed: 0, documentsDue: 1, notificationsWritten: 1,
  notificationsSkipped: 0, documentsWithoutRecipient: 0, errors: [],
};

beforeEach(() => {
  alerts.length = 0;
  notifyExpiringEvidence.mockReset();
});

describe('evidence-expiring job', () => {
  it('runs on the cron tick, and a clean run writes no alert', async () => {
    notifyExpiringEvidence.mockResolvedValue(clean);
    await evidenceExpiringTask({ _cron: { ts: '2026-10-06T05:20:00.000Z' } }, helpersFor());
    expect(notifyExpiringEvidence).toHaveBeenCalledWith({ now: new Date('2026-10-06T05:20:00.000Z') });
    expect(alerts).toEqual([]);
  });

  it('a failed tenant is a warn alert with counts only', async () => {
    notifyExpiringEvidence.mockResolvedValue({
      ...clean, tenantsFailed: 1, errors: [{ scope: 'tenant', reason: 'boom' }],
    });
    await evidenceExpiringTask({}, helpersFor());
    expect(alerts).toEqual([
      {
        level: 'warn',
        source: 'evidence-expiring',
        message: '1 of 2 tenants failed',
        meta: { tenantsFailed: 1, tenants: 2, written: 1 },
        dedupeKey: 'evidence-expiring:failed',
      },
    ]);
  });

  it('a failed run is an error alert and rethrows so the queue retries', async () => {
    notifyExpiringEvidence.mockRejectedValue(new Error('connection reset'));
    await expect(evidenceExpiringTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      { level: 'error', source: 'evidence-expiring', message: 'Evidence-expiring run failed: connection reset' },
    ]);
  });
});

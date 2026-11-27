import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The sweep itself is pinned against Postgres in tests/ai-reservation-orphans.live.test.ts;
// here only the job around it: which moment it sweeps by, when it alerts, what a failure leaves.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const releaseOrphanReservations = vi.fn();
vi.mock('@/lib/ai/reservation-orphans', () => ({
  releaseOrphanReservations,
  ORPHAN_ALERT_SOURCE: 'ai-reservation-orphans',
  ORPHAN_SWEEP_MODULES: ['M18'],
}));

const { aiReservationOrphansTask } = await import('../ai-reservation-orphans');

const logged: string[] = [];

function helpersFor(attempts = 1, maxAttempts = 3): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: (m: string) => logged.push(m), warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
  logged.length = 0;
  releaseOrphanReservations.mockReset();
});

describe('ai-reservation-orphans job', () => {
  it('sweeps by the cron tick with the configured age; no orphan, no alert', async () => {
    releaseOrphanReservations.mockResolvedValue({ released: 0, credits: 0, more: false });
    await aiReservationOrphansTask({ _cron: { ts: '2026-11-01T10:15:00.000Z' }, now: '2030-01-01' }, helpersFor());
    expect(releaseOrphanReservations).toHaveBeenCalledWith(new Date('2026-11-01T10:15:00.000Z'), { olderThanMinutes: 60 });
    expect(logged.find((m) => m.includes('DONE'))).toContain('"released":0');
    expect(alerts).toEqual([]);
  });

  it('orphans found: ONE warn SystemAlert with the counts only', async () => {
    releaseOrphanReservations.mockResolvedValue({ released: 3, credits: 4, more: false });
    await aiReservationOrphansTask({ _cron: { ts: '2026-11-01T10:15:00.000Z' } }, helpersFor());
    expect(alerts).toEqual([
      {
        level: 'warn',
        source: 'ai-reservation-orphans',
        message: 'Refunded 3 orphaned AI credit reservations (4 credits) older than 60 min',
        meta: { released: 3, credits: 4, more: false, olderThanMinutes: 60, modules: ['M18'] },
      },
    ]);
  });

  it('a failure writes an error SystemAlert at once and rethrows so the queue retries', async () => {
    releaseOrphanReservations.mockRejectedValue(new Error('connection reset'));
    await expect(aiReservationOrphansTask({}, helpersFor(1))).rejects.toThrow('connection reset');
    expect(alerts).toEqual([
      { level: 'error', source: 'ai-reservation-orphans-job', message: 'AI reservation orphan sweep failed: connection reset' },
    ]);
  });
});

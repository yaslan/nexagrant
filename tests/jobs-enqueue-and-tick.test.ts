import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

/**
 * İNCELEME-38 Ö-1 (TASK-MUMT3PGX5OK8P): two properties no test held.
 *   M6 — hand-added jobs use `unsafe_dedupe` (ADR-0008 §5 D4); `replace`
 *        would start a second copy next to a running one.
 *   M9 — the credit grant is for the TICK's month, so a retry that lands in
 *        the next month does not grant that month instead.
 * No database: graphile-worker's utils and the tenant loop are stand-ins.
 */
const addJob = vi.fn(async () => ({ id: '1' }));
vi.mock('graphile-worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('graphile-worker')>()),
  makeWorkerUtils: vi.fn(async () => ({
    migrate: async () => {},
    withPgClient: async () => ({ rows: [] }),
    addJob,
    release: async () => {},
  })),
}));

const written: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  prisma: { tenant: { findMany: async () => [{ id: 't1' }] } },
  withTenant: async (_id: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      creditLedger: {
        findFirst: async () => null,
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          written.push(...data);
          return { count: data.length };
        },
      },
    }),
}));
vi.mock('@/lib/billing', () => ({ getEntitlements: async () => ({ aiCreditsMonthly: 7 }) }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn(async () => {}) }));

const { enqueueJob } = await import('@/lib/jobs/enqueue');
const { taskList } = await import('@/lib/jobs/tasks');

function helpers(attempts: number): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: 5 },
    logger: { info: noop, warn: noop, error: noop, debug: noop },
  } as unknown as JobHelpers;
}

beforeEach(() => {
  addJob.mockClear();
  written.length = 0;
});

describe('enqueueJob (ADR-0008 §5 D4)', () => {
  it('adds with a stable key in unsafe_dedupe mode, never replace', async () => {
    await enqueueJob('credits-monthly-grant', { period: '2026-11' }, { connectionString: 'postgres://unused' });
    expect(addJob).toHaveBeenCalledTimes(1);
    expect(addJob.mock.calls[0]).toEqual([
      'credits-monthly-grant',
      { period: '2026-11' },
      expect.objectContaining({ jobKey: 'credits-monthly-grant:manual', jobKeyMode: 'unsafe_dedupe', maxAttempts: 5 }),
    ]);
  });
});

describe('credits-monthly-grant task', () => {
  it("grants for the tick's month, even when the retry runs in the next month", async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T00:30:00Z'), toFake: ['Date'] });
    try {
      await taskList['credits-monthly-grant']({ _cron: { ts: '2026-10-01T06:00:00.000Z' } }, helpers(3));
    } finally {
      vi.useRealTimers();
    }
    expect(written).toEqual([expect.objectContaining({ tenantId: 't1', delta: 7, grantPeriod: '2026-10' })]);
  });
});

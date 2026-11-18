/**
 * `k2-monthly-cordis` — the monthly job runs the real CORDIS import (NG-225).
 *
 * The job used to POST to a Python worker whose `/jobs/cordis` has no real
 * source and answers 500, so the scheduled refresh never imported anything;
 * the import that works (`runCordisImport`, SUCCESS by hand on 2026-11-17)
 * was reachable only from `scripts/cordis-import.ts`. These tests pin the job
 * to that import, and CLAUDE.md rule 6 on top: a failure leaves a
 * `SystemAlert` and a `success: false` result, it never throws.
 *
 * The importer itself (RawFetch, hash skip, its own failure alert) is pinned
 * in tests/cordis-import*.test.ts; here it is a stub.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// One in-memory SystemAlert table shared by the recorder, the resolver and the
// prisma read below, so a test can seed an open alert and see it close (NG-237).
interface FakeAlert {
  level: string;
  source: string;
  message: string;
  dedupeKey?: string;
  meta: Record<string, unknown>;
  resolvedAt: Date | null;
}
const alerts: FakeAlert[] = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    const dedupeKey = a.dedupeKey as string | undefined;
    alerts.push({
      level: a.level as string,
      source: a.source as string,
      message: a.message as string,
      dedupeKey,
      // The real writer stores the dedupe key inside meta; mirror that.
      meta: { ...((a.meta as Record<string, unknown>) ?? {}), ...(dedupeKey ? { alertDedupeKey: dedupeKey } : {}) },
      resolvedAt: null,
    });
  }),
  resolveAlerts: vi.fn(async (sel: { source: string; meta?: Record<string, unknown> }) => {
    let resolved = 0;
    for (const a of alerts) {
      if (a.source !== sel.source || a.resolvedAt !== null) continue;
      if (sel.meta && !Object.entries(sel.meta).every(([k, v]) => a.meta[k] === v)) continue;
      a.resolvedAt = new Date();
      resolved++;
    }
    return { resolved };
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    systemAlert: {
      findMany: vi.fn(async (args: { where: { source: string; resolvedAt: null } }) =>
        alerts
          .filter((a) => a.source === args.where.source && a.resolvedAt === null)
          .map((a) => ({ id: a.message, meta: a.meta }))
      ),
    },
  },
}));

function openAlert(source: string, dedupeKey: string): void {
  alerts.push({ level: 'error', source, message: dedupeKey, dedupeKey, meta: { alertDedupeKey: dedupeKey }, resolvedAt: null });
}

const runCordisImport = vi.fn();
vi.mock('@/lib/k2-cordis/importer', () => ({ runCordisImport }));

const generatePartnerProfiles = vi.fn();
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({ generatePartnerProfiles }));

// The heap the job sees. 8 GB unless a test says otherwise, so no test depends
// on the runner's own --max-old-space-size.
let heapLimitMb = 8192;
vi.mock('node:v8', async (orig) => {
  const real = await orig<typeof import('node:v8')>();
  const getHeapStatistics = () => ({ ...real.getHeapStatistics(), heap_size_limit: heapLimitMb * 1024 * 1024 });
  return { ...real, default: { ...real, getHeapStatistics }, getHeapStatistics };
});

const { runK2MonthlyCordis, k2MonthlyCordisTask, K2_MIN_HEAP_MB } = await import(
  '../src/lib/jobs/tasks/k2-monthly-cordis'
);

const ROWS = { projects: 23613, organizations: 36753, participations: 140000, topics: 23613, scivocs: 50000 };

function imported(over: Record<string, unknown> = {}) {
  return { success: true, runId: 'run-1', fileHash: 'h1', rowCounts: ROWS, durationMs: 10, ...over };
}

function helpersFor(): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '7', attempts: 1, max_attempts: 5 } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  heapLimitMb = 8192;
  alerts.length = 0;
  runCordisImport.mockReset();
  generatePartnerProfiles.mockReset();
  vi.restoreAllMocks();
});

describe('k2-monthly-cordis job', () => {
  it('runs the real CORDIS import when the cron fires, and calls no worker', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    runCordisImport.mockResolvedValue(imported());
    generatePartnerProfiles.mockResolvedValue({ success: true, updatedProfiles: 3, updatedCoParticipations: 4, durationMs: 1 });

    await k2MonthlyCordisTask({ _cron: { ts: '2026-12-01T04:00:00.000Z' } }, helpersFor());

    expect(runCordisImport).toHaveBeenCalledTimes(1);
    expect(runCordisImport.mock.calls[0]![0]).toMatchObject({ dataset: 'HORIZON' });
    // A full import, never a smoke run: neither mark would let the next month skip.
    expect(runCordisImport.mock.calls[0]![0]).not.toHaveProperty('dryRun');
    expect(runCordisImport.mock.calls[0]![0]).not.toHaveProperty('limit');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('runK2MonthlyCordis', () => {
  it('imports, rebuilds the partner profiles and reports the counts', async () => {
    runCordisImport.mockResolvedValue(imported());
    generatePartnerProfiles.mockResolvedValue({ success: true, updatedProfiles: 36753, updatedCoParticipations: 1105839, durationMs: 1 });

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(true);
    expect(result.month).toBe('2026-12');
    expect(result.runId).toBe('run-1');
    expect(result.rowCounts?.projects).toBe(23613);
    expect(result.profiles?.updatedProfiles).toBe(36753);
    expect(generatePartnerProfiles).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveLength(0);
  });

  it('treats an unchanged dump ("Zaten güncel") as success and leaves the profiles alone', async () => {
    runCordisImport.mockResolvedValue(imported({ skipped: true, rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0, scivocs: 0 } }));

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(generatePartnerProfiles).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);
  });

  it('reports a failed import as a failure without a second alert (the importer wrote it)', async () => {
    runCordisImport.mockResolvedValue({ ...imported(), success: false, errorCode: 'SKIP_LIMIT_EXCEEDED' });

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('SKIP_LIMIT_EXCEEDED');
    expect(generatePartnerProfiles).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);
  });

  it('writes a SystemAlert and does not throw when the import itself throws', async () => {
    // The importer only throws before it has a run row (the CordisImportRun
    // insert failed), so its own alert never ran: the job must write one.
    runCordisImport.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(false);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', source: 'k2_monthly_cordis' });
    expect(String(alerts[0]!.message)).toContain('ECONNREFUSED');
  });

  it('writes a SystemAlert when the partner profiles fail after a good import', async () => {
    runCordisImport.mockResolvedValue(imported());
    generatePartnerProfiles.mockRejectedValue(new Error('deadlock detected'));

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(false);
    // The import landed; the result still says so.
    expect(result.rowCounts?.projects).toBe(23613);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', source: 'k2_monthly_cordis' });
  });

  it('refuses to start with a heap below the floor, with an alert, instead of crashing the worker', async () => {
    // Node's default on a 64-bit machine is ~4 GB; the 2026-11-17 run peaked at 4.4 GB RSS.
    heapLimitMb = 4144;

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('HEAP_TOO_SMALL');
    expect(runCordisImport).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', source: 'k2_monthly_cordis', dedupeKey: 'k2:heap-too-small' });
    expect(String(alerts[0]!.message)).toContain('--max-old-space-size');
  });

  it('runs at exactly the floor', async () => {
    heapLimitMb = K2_MIN_HEAP_MB;
    runCordisImport.mockResolvedValue(imported({ skipped: true }));

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(true);
    expect(runCordisImport).toHaveBeenCalledTimes(1);
  });
});

describe('k2-monthly-cordis: profiles and alerts after a run (NG-237)', () => {
  const PROFILES = { success: true, updatedProfiles: 36753, updatedCoParticipations: 1105839, durationMs: 1 };

  it('rebuilds the partner profiles on an unchanged dump when they failed last time (Ö-1)', async () => {
    // The import landed earlier; the profile step then failed and left its alert open.
    openAlert('k2_monthly_cordis', 'k2:partner-profiles-failed');
    runCordisImport.mockResolvedValue(imported({ skipped: true }));
    generatePartnerProfiles.mockResolvedValue(PROFILES);

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(true);
    expect(generatePartnerProfiles).toHaveBeenCalledTimes(1);
    expect(alerts[0]!.resolvedAt).not.toBeNull();
  });

  it('closes its own open k2 alerts on a successful run (Ö-2)', async () => {
    openAlert('k2_monthly_cordis', 'k2:heap-too-small');
    openAlert('k2_monthly_cordis', 'k2:partner-profiles-failed');
    openAlert('k2_monthly_cordis', 'k2:cordis-import-threw:HORIZON');
    runCordisImport.mockResolvedValue(imported());
    generatePartnerProfiles.mockResolvedValue(PROFILES);

    const result = await runK2MonthlyCordis({ month: '2026-12' });

    expect(result.success).toBe(true);
    expect(alerts.filter((a) => a.resolvedAt === null)).toHaveLength(0);
  });
});

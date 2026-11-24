import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The database side is pinned in tests/agency-report-retention.live.test.ts. Here only the job
// around it: which moment it works by, what a failure writes, and that a retry opens no new alert.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const purgeExpiredAgencyReports = vi.fn();
const pruneExpiredDeletionLogs = vi.fn();
const pruneOrphanedDeletionLogs = vi.fn();
vi.mock('@/lib/agency/retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agency/retention')>()),
  purgeExpiredAgencyReports,
  pruneExpiredDeletionLogs,
  pruneOrphanedDeletionLogs,
}));

const { agencyReportRetentionTask } = await import('../agency-report-retention');

// The task wrapper returns nothing; the job's summary reaches the operator through the logger.
const infoLines: string[] = [];
function helpersFor(): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts: 1, max_attempts: 5 } as unknown as JobHelpers['job'],
    logger: {
      info: (line: string) => infoLines.push(line),
      warn: noop,
      error: noop,
      debug: noop,
    } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

const TICK = '2027-01-01T05:00:00.000Z';
const RUN = `cron:${TICK}`;
const okPurge = { runId: RUN, cutoff: '2026-01-01T04:59:00.000Z', agencies: 2, deleted: 0, purged: [], failed: 0, errors: [] };
const okPrune = { cutoff: '2024-01-01T04:59:00.000Z', agencies: 2, deleted: 0, failed: 0, errors: [] };
const okOrphans = { cutoff: '2024-01-01T04:59:00.000Z', deleted: 0, error: null };

beforeEach(() => {
  alerts.length = 0;
  purgeExpiredAgencyReports.mockReset();
  pruneExpiredDeletionLogs.mockReset();
  pruneOrphanedDeletionLogs.mockReset();
  pruneOrphanedDeletionLogs.mockResolvedValue(okOrphans);
});

describe('agency-report-retention job (NG-345)', () => {
  it('works by the cron tick, for the purge and for the record prune alike', async () => {
    purgeExpiredAgencyReports.mockResolvedValue(okPurge);
    pruneExpiredDeletionLogs.mockResolvedValue(okPrune);
    await agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor());
    expect(purgeExpiredAgencyReports).toHaveBeenCalledWith(new Date(TICK), RUN);
    expect(pruneExpiredDeletionLogs).toHaveBeenCalledWith(new Date(TICK));
    expect(pruneOrphanedDeletionLogs).toHaveBeenCalledTimes(1);
    expect(pruneOrphanedDeletionLogs).toHaveBeenCalledWith(new Date(TICK));
    expect(alerts).toEqual([]);
  });

  it('reports the prune count next to the purge result, and writes no alert when all is well', async () => {
    purgeExpiredAgencyReports.mockResolvedValue({ ...okPurge, deleted: 3 });
    pruneExpiredDeletionLogs.mockResolvedValue({ ...okPrune, deleted: 1 });
    pruneOrphanedDeletionLogs.mockResolvedValue({ ...okOrphans, deleted: 4 });
    infoLines.length = 0;
    await agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor());
    const done = infoLines.find((l) => l.includes('DONE'));
    expect(done).toBeDefined();
    expect(JSON.parse(done!.slice(done!.indexOf('{')))).toMatchObject({
      success: true,
      deleted: 3,
      deletionLogPruned: 1,
      deletionLogOrphansPruned: 4,
      retentionMonths: 12,
      deletionLogRetentionYears: 3,
    });
    expect(alerts).toEqual([]);
  });

  it('a failed purge writes one error alert keyed by the run id, and rethrows so the queue retries', async () => {
    purgeExpiredAgencyReports.mockResolvedValue({ ...okPurge, failed: 1, errors: [{ tenantId: 't1', message: 'boom' }] });
    pruneExpiredDeletionLogs.mockResolvedValue(okPrune);
    await expect(agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor())).rejects.toThrow(/1 agencies failed \(boom\)/);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', source: 'agency-report-retention', dedupeKey: RUN });
  });

  it('a retry of the same tick carries the same dedupe key, so the alert folds into the open one (NG-345 Ö1)', async () => {
    purgeExpiredAgencyReports.mockResolvedValue({ ...okPurge, failed: 1, errors: [{ tenantId: 't1', message: 'boom' }] });
    pruneExpiredDeletionLogs.mockResolvedValue(okPrune);
    await expect(agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor())).rejects.toThrow();
    await expect(agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor())).rejects.toThrow();
    expect(alerts.map((a) => a.dedupeKey)).toEqual([RUN, RUN]);
  });

  it('a failed record prune alone also alerts and rethrows, and the purge result is not lost', async () => {
    purgeExpiredAgencyReports.mockResolvedValue(okPurge);
    pruneExpiredDeletionLogs.mockResolvedValue({ ...okPrune, failed: 2, errors: [{ tenantId: 't2', message: 'denied' }] });
    await expect(agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor())).rejects.toThrow(/prune: 2 agencies failed \(denied\)/);
    expect(purgeExpiredAgencyReports).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ dedupeKey: RUN });
  });

  it('a failed hard-deleted-agency prune alone also alerts and rethrows, after both other steps ran (NG-349)', async () => {
    purgeExpiredAgencyReports.mockResolvedValue(okPurge);
    pruneExpiredDeletionLogs.mockResolvedValue(okPrune);
    pruneOrphanedDeletionLogs.mockResolvedValue({ ...okOrphans, error: 'function missing' });
    await expect(agencyReportRetentionTask({ _cron: { ts: TICK } }, helpersFor())).rejects.toThrow(
      /hard-deleted agencies prune failed \(function missing\)/
    );
    expect(purgeExpiredAgencyReports).toHaveBeenCalledTimes(1);
    expect(pruneExpiredDeletionLogs).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', dedupeKey: RUN, meta: { deletionLogOrphansPruned: 0 } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The wrapper and the health check write SystemAlert rows; record them instead.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const generateAgencyReports = vi.fn(async () => ({ agencies: 1, generated: 1, skipped: 0, failed: 0, errors: [] }));
vi.mock('@/lib/agency/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agency/report')>()),
  generateAgencyReports,
}));

const { SCHEDULE, JOB_IDS, crontab, previousTick, findMissedTicks } = await import('@/lib/jobs/schedule');
const { defineJob } = await import('@/lib/jobs/define');
const { taskList } = await import('@/lib/jobs/tasks');
const { assessQueue, healthAlerts } = await import('@/lib/jobs/tasks/job-queue-health');
const { jobsCronEnabled, JobsCronUnsetInProductionError } = await import('@/lib/env');

function helpersFor(attempts: number, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '42', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

const byId = (id: string) => SCHEDULE.find((j) => j.id === id)!;

beforeEach(() => {
  alerts.length = 0;
  generateAgencyReports.mockClear();
});

describe('schedule (ADR-0008 §2)', () => {
  it('keeps the cron expressions the old scheduler used, one per job', () => {
    expect(Object.fromEntries(SCHEDULE.map((j) => [j.id, j.cron]))).toEqual({
      'k1-daily-calls': '0 2 * * *',
      'k2-monthly-cordis': '0 4 1 * *',
      'alerts-daily': '0 8 * * *',
      'credits-monthly-grant': '0 6 1 * *',
      'm4-weekly-summary': '0 9 * * 1',
      'users-scheduled-deletion': '0 3 * * *',
      'feedback-weekly-digest': '0 6 * * 1',
      'alerts-sweep': '15 4 * * *',
      'stripe-event-cleanup': '0 2 * * *',
      'agency-monthly-report': '0 6 1 * *',
      'partner-search': '0 3 * * *',
      'invitation-cleanup': '30 3 * * *',
      'public-lead-cleanup': '45 3 * * *',
      'expert-prereg-cleanup': '55 3 * * *',
      'k1-topic-match': '30 2 * * *',
      'k1-embeddings': '15 2 * * *',
      'm4-stale-relationships': '0 7 * * *',
      'job-queue-health': '5 * * * *',
      'notifications-retention': '50 3 * * *',
      'evidence-expiring': '20 5 * * *',
    });
  });

  it('serves a task for every scheduled job and nothing else', () => {
    expect(Object.keys(taskList).sort()).toEqual([...JOB_IDS].sort());
    for (const id of JOB_IDS) expect(typeof taskList[id]).toBe('function');
  });

  it('writes one crontab line per job with its attempts, backfill and queue', () => {
    const lines = crontab().trim().split('\n');
    expect(lines).toHaveLength(SCHEDULE.length);
    expect(lines).toContain('0 6 1 * * agency-monthly-report ?id=agency-monthly-report&max=5&fill=1d&queue=agency');
    expect(lines).toContain('0 2 * * * k1-daily-calls ?id=k1-daily-calls&max=5&fill=6h');
    expect(lines).toContain('5 * * * * job-queue-health ?id=job-queue-health&max=3');
    expect(lines).toContain('30 3 * * * invitation-cleanup ?id=invitation-cleanup&max=5&fill=6h');
    expect(lines).toContain('45 3 * * * public-lead-cleanup ?id=public-lead-cleanup&max=5&fill=6h');
    expect(lines).toContain('55 3 * * * expert-prereg-cleanup ?id=expert-prereg-cleanup&max=5&fill=6h');
    expect(lines).toContain('50 3 * * * notifications-retention ?id=notifications-retention&max=5&fill=6h');
    expect(lines).toContain('30 2 * * * k1-topic-match ?id=k1-topic-match&max=5&fill=6h&queue=k1-topic-match');
    expect(lines).toContain('15 2 * * * k1-embeddings ?id=k1-embeddings&max=5&fill=6h&queue=k1-embeddings');
    expect(lines).toContain('0 7 * * * m4-stale-relationships ?id=m4-stale-relationships&max=5&fill=6h&queue=m4-stale-relationships');
  });
});

describe('missed-tick detection (ADR-0008 Ö-3)', () => {
  const k2 = byId('k2-monthly-cordis');
  const known = (last: string | null, since = '2026-01-01T00:00:00Z') =>
    JOB_IDS.map((id) => ({ identifier: id, known_since: new Date(since), last_execution: last ? new Date(last) : null }));

  it('finds the latest tick at or before a moment', () => {
    expect(previousTick(k2, new Date('2026-10-15T12:00:00Z'))?.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(previousTick(k2, new Date('2026-10-01T04:00:00Z'))?.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(previousTick(byId('m4-weekly-summary'), new Date('2026-09-30T00:00:00Z'))?.toISOString()).toBe(
      '2026-09-28T09:00:00.000Z'
    );
  });

  it('reports a monthly tick that no worker scheduled (down longer than fill=1d)', () => {
    const rows = known(null).map((r) =>
      r.identifier === 'k2-monthly-cordis' ? { ...r, last_execution: new Date('2026-09-01T04:00:00Z') } : { ...r, last_execution: new Date('2026-10-03T11:30:00Z') }
    );
    const missed = findMissedTicks(rows, new Date('2026-10-03T12:00:00Z'));
    expect(missed.map((m) => [m.id, m.tick.toISOString()])).toEqual([['k2-monthly-cordis', '2026-10-01T04:00:00.000Z']]);
  });

  it('reports nothing when every due tick was scheduled', () => {
    expect(findMissedTicks(known('2026-10-03T11:00:00Z'), new Date('2026-10-03T12:00:00Z'))).toEqual([]);
  });

  it('ignores a tick from before the crontab was registered, and one still inside the grace period', () => {
    expect(findMissedTicks(known(null, '2026-10-03T11:00:00Z'), new Date('2026-10-03T12:00:00Z'))).toEqual([]);
    // 08:05 is 5 minutes after the alerts-daily tick: not yet reported.
    const rows = known('2026-10-02T09:00:00Z');
    expect(findMissedTicks(rows, new Date('2026-10-03T08:05:00Z')).map((m) => m.id)).not.toContain('alerts-daily');
    expect(findMissedTicks(rows, new Date('2026-10-03T08:20:00Z')).map((m) => m.id)).toContain('alerts-daily');
  });

  it('never reports the health check itself', () => {
    const rows = known('2026-01-01T00:00:00Z');
    expect(findMissedTicks(rows, new Date('2026-10-03T12:00:00Z')).map((m) => m.id)).not.toContain('job-queue-health');
  });

  it('turns missed, exhausted and stuck jobs into SystemAlerts with stable keys', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const health = assessQueue(
      known('2026-10-03T11:00:00Z'),
      [
        { id: '1', task_identifier: 'alerts-daily', attempts: 5, max_attempts: 5, last_error: 'smtp down', locked_at: null },
        { id: '2', task_identifier: 'k1-daily-calls', attempts: 1, max_attempts: 5, last_error: null, locked_at: new Date('2026-10-03T07:00:00Z') },
        { id: '3', task_identifier: 'k1-daily-calls', attempts: 1, max_attempts: 5, last_error: null, locked_at: new Date('2026-10-03T11:00:00Z') },
      ],
      now
    );
    expect(healthAlerts(health).map((a) => [a.level, a.dedupeKey])).toEqual([
      ['error', 'job-queue:alerts-daily:exhausted'],
      ['warn', 'job-queue:k1-daily-calls:stuck'],
    ]);
  });

  it('does not call a job exhausted while its last attempt is still running (İNCELEME-38 Ö-1 M7)', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const health = assessQueue(
      known('2026-10-03T11:00:00Z'),
      [{ id: '4', task_identifier: 'alerts-daily', attempts: 5, max_attempts: 5, last_error: 'smtp down', locked_at: new Date('2026-10-03T11:59:00Z') }],
      now
    );
    expect(health.exhausted).toEqual([]);
    expect(healthAlerts(health)).toEqual([]);
  });
});

describe('defineJob (ADR-0008 §6.3-6.4)', () => {
  it('hands the body the tick it was scheduled for, without _cron in the payload', async () => {
    const seen: unknown[] = [];
    const task = defineJob('alerts-sweep', async (ctx) => {
      seen.push(ctx.tick?.toISOString(), ctx.payload);
    });
    await task({ _cron: { ts: '2026-10-01T04:15:00.000Z' }, x: 1 }, helpersFor(1));
    expect(seen).toEqual(['2026-10-01T04:15:00.000Z', { x: 1 }]);
  });

  it('does not throw on a reported failure, so the queue does not retry it', async () => {
    const task = defineJob('k2-monthly-cordis', async () => ({ success: false, message: 'worker 503' }));
    await expect(task({}, helpersFor(1))).resolves.toBeUndefined();
    expect(alerts).toEqual([]);
  });

  it('rethrows for a retry, and writes the exhausted alert only on the last attempt', async () => {
    const task = defineJob('alerts-daily', async () => {
      throw new Error('db down');
    });
    await expect(task({}, helpersFor(4))).rejects.toThrow('db down');
    expect(alerts).toEqual([]);
    await expect(task({}, helpersFor(5))).rejects.toThrow('db down');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error', source: 'job-queue', dedupeKey: 'job-queue:alerts-daily:exhausted' });
  });
});

describe('agency-monthly-report task', () => {
  it('reports on the month before the tick, even when the run is late', async () => {
    await taskList['agency-monthly-report']({ _cron: { ts: '2026-10-01T06:00:00.000Z' } }, helpersFor(1));
    expect(generateAgencyReports).toHaveBeenCalledWith('2026-09', expect.any(Date));
  });

  it('refuses a bad hand-added period without throwing (no retry) and alerts once', async () => {
    await expect(taskList['agency-monthly-report']({ period: '1999-01' }, helpersFor(1))).resolves.toBeUndefined();
    expect(generateAgencyReports).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'warn', source: 'agency-monthly-report' });
  });
});

describe('JOBS_CRON_ENABLED (ADR-0008 Ö-2)', () => {
  it('must be explicit in production', () => {
    expect(() => jobsCronEnabled({ NODE_ENV: 'production' })).toThrow(JobsCronUnsetInProductionError);
    expect(jobsCronEnabled({ NODE_ENV: 'production', JOBS_CRON_ENABLED: 'false' })).toBe(false);
    expect(jobsCronEnabled({ NODE_ENV: 'production', JOBS_CRON_ENABLED: 'true' })).toBe(true);
  });

  it('defaults to on outside production', () => {
    expect(jobsCronEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(jobsCronEnabled({ NODE_ENV: 'test', JOBS_CRON_ENABLED: 'false' })).toBe(false);
  });
});

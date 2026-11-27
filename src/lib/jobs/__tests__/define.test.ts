import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';
import type { JobId } from '../schedule';
import type { JobContext } from '../define';

const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));

const { defineJob, parseCronTick } = await import('../define');

const ID = 'public-lead-cleanup' as JobId;

function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '11', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

beforeEach(() => {
  alerts.length = 0;
});

describe('parseCronTick', () => {
  it('reads a valid ISO tick', () => {
    expect(parseCronTick('2026-11-27T03:45:00.000Z')).toEqual(new Date('2026-11-27T03:45:00.000Z'));
  });

  it('a missing tick is null, with no alert needed', () => {
    expect(parseCronTick(undefined)).toBeNull();
    expect(parseCronTick(null)).toBeNull();
  });

  it('an unreadable tick is null, never a throw', () => {
    expect(parseCronTick('garbage')).toBeNull();
    expect(parseCronTick('')).toBeNull();
    expect(parseCronTick(12345)).toBeNull();
  });
});

describe('defineJob with a bad cron tick (NG-375 B-4)', () => {
  it('runs the body with a null tick and writes a bad-tick SystemAlert', async () => {
    const body = vi.fn(async (_ctx: JobContext) => ({ success: true }));
    const task = defineJob(ID, body);
    await task({ _cron: { ts: 'garbage' }, keep: 1 }, helpersFor());
    expect(body).toHaveBeenCalledTimes(1);
    const ctx = body.mock.calls[0]?.[0] as JobContext;
    expect(ctx.tick).toBeNull();
    expect(ctx.payload).toEqual({ keep: 1 });
    expect(alerts).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'job-queue',
        dedupeKey: `job-queue:${ID}:bad-tick`,
        meta: expect.objectContaining({ job: ID, rawTick: 'garbage' }),
      }),
    ]);
  });

  it('a valid tick runs the body with that tick and writes no alert', async () => {
    const body = vi.fn(async (_ctx: JobContext) => ({ success: true }));
    await defineJob(ID, body)({ _cron: { ts: '2026-11-27T03:45:00.000Z' } }, helpersFor());
    const ctx = body.mock.calls[0]?.[0] as JobContext;
    expect(ctx.tick?.toISOString()).toBe('2026-11-27T03:45:00.000Z');
    expect(alerts).toEqual([]);
  });

  it('a hand-added run with no tick writes no alert', async () => {
    const body = vi.fn(async (_ctx: JobContext) => ({ success: true }));
    await defineJob(ID, body)({}, helpersFor());
    expect(body).toHaveBeenCalledTimes(1);
    expect(alerts).toEqual([]);
  });
});

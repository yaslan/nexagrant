import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RANGE_DAYS,
  MAX_TREND_BUCKETS,
  parseRangeParam,
  resolveDashboardRange,
  toRangeParam,
  trendIntervalDays,
} from '../../src/modules/m5/server/range';

const NOW = new Date(2026, 8, 6, 19, 30); // 2026-09-06 19:30 local

describe('parseRangeParam', () => {
  it('accepts a YYYY-MM-DD local date', () => {
    expect(toRangeParam(parseRangeParam('2026-01-31')!)).toBe('2026-01-31');
  });

  it.each(['', undefined, '2026-1-3', '31/01/2026', '2026-01-31T00:00:00Z', 'nope'])(
    'rejects %s',
    (value) => {
      expect(parseRangeParam(value as string | undefined)).toBeNull();
    }
  );

  it('rejects a well-formed but impossible date', () => {
    expect(parseRangeParam('2026-13-01')).toBeNull();
  });
});

describe('resolveDashboardRange', () => {
  it('defaults to the last 30 days ending today', () => {
    const range = resolveDashboardRange(undefined, undefined, NOW);
    expect(toRangeParam(range.to)).toBe('2026-09-06');
    expect(toRangeParam(range.from)).toBe('2026-08-07');
  });

  it('honours an explicit range', () => {
    const range = resolveDashboardRange('2026-01-01', '2026-01-31', NOW);
    expect(toRangeParam(range.from)).toBe('2026-01-01');
    expect(toRangeParam(range.to)).toBe('2026-01-31');
  });

  it('makes the end day inclusive', () => {
    const { to, rangeEnd } = resolveDashboardRange('2026-01-01', '2026-01-31', NOW);
    expect(rangeEnd.getTime() - to.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    expect(toRangeParam(rangeEnd)).toBe('2026-01-31');
  });

  it('falls back to the default window when from is after to', () => {
    const range = resolveDashboardRange('2026-02-01', '2026-01-31', NOW);
    expect(toRangeParam(range.to)).toBe('2026-01-31');
    expect(toRangeParam(range.from)).toBe('2026-01-01');
  });

  it('falls back to the default window when from is junk', () => {
    const range = resolveDashboardRange('drop table', '2026-01-31', NOW);
    const expected = new Date(range.to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    expect(toRangeParam(range.from)).toBe(toRangeParam(expected));
  });

  it('never returns a range whose start is after its end', () => {
    for (const [from, to] of [
      ['2030-01-01', '2020-01-01'],
      [undefined, undefined],
      ['x', 'y'],
    ] as Array<[string | undefined, string | undefined]>) {
      const range = resolveDashboardRange(from, to, NOW);
      expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());
    }
  });
});

describe('trendIntervalDays (TASK-MVCW3ANV1JU6Y)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  // The bucket count the trend query draws for a width: floor(span / step) + 1.
  const buckets = (from: Date, to: Date, days: number) =>
    Math.floor((to.getTime() - from.getTime()) / (days * DAY)) + 1;
  const range = (from: string, to: string) => {
    const r = resolveDashboardRange(from, to, NOW);
    return [r.from, r.rangeEnd] as const;
  };

  it('stays weekly while the range fits in the cap', () => {
    expect(trendIntervalDays(...range('2026-01-01', '2026-01-31'))).toBe(7);
    expect(trendIntervalDays(...range('2024-01-01', '2025-12-31'))).toBe(7);
  });

  it('widens a five-year range to a multiple of a week', () => {
    const [from, to] = range('2021-01-04', '2025-12-31');
    const days = trendIntervalDays(from, to);
    expect(days).toBe(21);
    expect(buckets(from, to, days)).toBe(87);
  });

  it('caps the year-1000 range from the review at the bucket limit', () => {
    const [from, to] = range('1000-01-01', '2026-09-06');
    expect(buckets(from, to, 7)).toBeGreaterThan(50_000);
    const days = trendIntervalDays(from, to);
    expect(days % 7).toBe(0);
    expect(buckets(from, to, days)).toBeLessThanOrEqual(MAX_TREND_BUCKETS);
  });

  it('never exceeds the cap and never widens more than one step past it, at any length', () => {
    const to = new Date(2026, 8, 6);
    for (let spanDays = 0; spanDays <= 400_000; spanDays += 97) {
      const from = new Date(to.getTime() - spanDays * DAY);
      const days = trendIntervalDays(from, to);
      expect(buckets(from, to, days)).toBeLessThanOrEqual(MAX_TREND_BUCKETS);
      if (days > 7) expect(buckets(from, to, days - 7)).toBeGreaterThan(MAX_TREND_BUCKETS);
    }
  });

  it('honours a wider minimum and an empty or inverted range', () => {
    const [from, to] = range('2026-01-01', '2026-01-31');
    expect(trendIntervalDays(from, to, 30)).toBe(30);
    expect(trendIntervalDays(to, from)).toBe(7);
    expect(trendIntervalDays(from, from)).toBe(7);
  });
});

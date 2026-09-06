import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RANGE_DAYS,
  parseRangeParam,
  resolveDashboardRange,
  toRangeParam,
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

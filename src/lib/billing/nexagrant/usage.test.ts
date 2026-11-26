/**
 * NG-250 — usage counters (pure half): the Istanbul month a monthly quota counts in, and
 * the limit decision every counter shares (seats, AI writing operations).
 */
import { describe, expect, it } from 'vitest';
import { istanbulMonthStart, ngLimitAllows, ngSeatEnforcementOn } from './usage';

describe('istanbulMonthStart', () => {
  it('00:00 Istanbul on the 1st, as a UTC instant (UTC+3)', () => {
    expect(istanbulMonthStart(new Date('2026-11-19T09:00:00Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('the first Istanbul minute of a month already counts in that month', () => {
    expect(istanbulMonthStart(new Date('2026-11-30T21:00:00Z')).toISOString()).toBe('2026-11-30T21:00:00.000Z');
    expect(istanbulMonthStart(new Date('2026-11-30T20:59:59.999Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('January rolls back to the previous year correctly', () => {
    expect(istanbulMonthStart(new Date('2027-01-01T00:30:00Z')).toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});

describe('ngLimitAllows', () => {
  it('not granted → never', () => {
    expect(ngLimitAllows({ granted: false }, 0)).toBe(false);
  });
  it('unlimited (null) → always', () => {
    expect(ngLimitAllows({ granted: true, limit: null }, 1_000_000)).toBe(true);
  });
  it('one more is allowed only below the limit', () => {
    expect(ngLimitAllows({ granted: true, limit: 3 }, 2)).toBe(true);
    expect(ngLimitAllows({ granted: true, limit: 3 }, 3)).toBe(false);
    expect(ngLimitAllows({ granted: true, limit: 0 }, 0)).toBe(false);
  });
});

describe('seat enforcement flag (waits on the seat-count approval)', () => {
  it('off unless NG_SEAT_LIMIT_ENFORCED is exactly "true"', () => {
    expect(ngSeatEnforcementOn({})).toBe(false);
    expect(ngSeatEnforcementOn({ NG_SEAT_LIMIT_ENFORCED: '1' })).toBe(false);
    expect(ngSeatEnforcementOn({ NG_SEAT_LIMIT_ENFORCED: 'false' })).toBe(false);
    expect(ngSeatEnforcementOn({ NG_SEAT_LIMIT_ENFORCED: 'true' })).toBe(true);
  });
});

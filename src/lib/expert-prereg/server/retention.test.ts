import { describe, expect, it } from 'vitest';
import { EXPERT_PREREG_RETENTION_DAYS } from './constants';
import { expertPreRegPurgeCutoff, purgeableExpertPreRegWhere } from './retention';

const NOW = new Date('2026-10-17T03:55:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('expert pre-registration retention (FO-50)', () => {
  it('keeps one year', () => {
    expect(EXPERT_PREREG_RETENTION_DAYS).toBe(365);
    expect(expertPreRegPurgeCutoff(NOW).toISOString()).toBe(new Date(NOW.getTime() - 365 * DAY).toISOString());
  });

  it('refuses a window that is not a whole number of days, or a date that is not a date', () => {
    expect(() => expertPreRegPurgeCutoff(NOW, 0)).toThrow(RangeError);
    expect(() => expertPreRegPurgeCutoff(NOW, 1.5)).toThrow(RangeError);
    expect(() => expertPreRegPurgeCutoff(new Date('nope'))).toThrow(RangeError);
  });

  it('filters by createdAt alone: the holder of the highest founder number is not spared (K-568932 = A)', () => {
    const cutoff = expertPreRegPurgeCutoff(NOW);
    expect(purgeableExpertPreRegWhere(cutoff)).toEqual({
      createdAt: { lt: cutoff },
    });
  });

  it('refuses a filterless delete when the cutoff is not a valid date', () => {
    expect(() => purgeableExpertPreRegWhere(undefined as unknown as Date)).toThrow(RangeError);
    expect(() => purgeableExpertPreRegWhere(new Date('nope'))).toThrow(RangeError);
  });
});

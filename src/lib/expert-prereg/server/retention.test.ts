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

  it('filters by createdAt only when no founder number is held yet', () => {
    const cutoff = expertPreRegPurgeCutoff(NOW);
    expect(purgeableExpertPreRegWhere(cutoff, null)).toEqual({
      createdAt: { lt: cutoff },
    });
  });

  it('spares the holder of the highest founder number and any row above it, never a NULL-number row', () => {
    const cutoff = expertPreRegPurgeCutoff(NOW);
    expect(purgeableExpertPreRegWhere(cutoff, 7)).toEqual({
      createdAt: { lt: cutoff },
      OR: [{ founderNumber: null }, { founderNumber: { lt: 7 } }],
    });
  });

  it('refuses a filterless delete when the cutoff is not a valid date', () => {
    expect(() => purgeableExpertPreRegWhere(undefined as unknown as Date, null)).toThrow(RangeError);
    expect(() => purgeableExpertPreRegWhere(new Date('nope'), 3)).toThrow(RangeError);
  });
});

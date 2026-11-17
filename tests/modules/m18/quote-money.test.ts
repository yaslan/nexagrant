import { describe, expect, it } from 'vitest';

import { quoteTotals, successFee } from '@/modules/m18/server/quote-money';

describe('M18 quote money — lines and total', () => {
  it('nets each line with lineNetMinor and sums exactly', () => {
    const q = quoteTotals(
      [
        { label: 'Ön analiz', quantity: 1, unitCents: 150_000 },
        { label: 'Yazım günü', quantity: 2.5, unitCents: 60_001 },
        { label: 'Çeviri', quantity: 0.5, unitCents: 113 },
      ],
      'eur'
    );
    expect(q.lines.map((l) => l.netCents)).toEqual([150_000, 150_003, 57]);
    expect(q.totalCents).toBe(300_060);
    expect(q.currency).toBe('EUR');
  });

  it('an empty quote totals 0', () => {
    expect(quoteTotals([], 'TRY').totalCents).toBe(0);
  });

  it('refuses float cents, negative prices and bad currency codes', () => {
    expect(() => quoteTotals([{ label: 'x', quantity: 1, unitCents: 1.5 }], 'EUR')).toThrow();
    expect(() => quoteTotals([{ label: 'x', quantity: 1, unitCents: -1 }], 'EUR')).toThrow();
    expect(() => quoteTotals([], 'EURO')).toThrow(/ISO 4217/);
  });

  it('refuses a total beyond the safe integer range', () => {
    const big = Number.MAX_SAFE_INTEGER - 1;
    expect(() => quoteTotals([{ label: 'a', quantity: 1, unitCents: big }, { label: 'b', quantity: 1, unitCents: big }], 'EUR')).toThrow(/safe integer/);
  });
});

describe('M18 quote money — success fee (consultancy fee, not an eligible cost)', () => {
  const terms = { successFeeBp: 500, successFeeCapCents: null, currency: 'EUR' };

  it('is grant × bp / 10000, flagged as not an eligible cost', () => {
    expect(successFee(10_000_000, 'EUR', terms)).toEqual({
      feeCents: 500_000,
      capped: false,
      currency: 'EUR',
      successFeeIsEligibleCost: false,
    });
  });

  it('rounds half-up on the exact integer product', () => {
    // 333 bp of 150 = 4.995 → 5; of 149 = 4.9617 → 5; of 15 = 0.4995 → 0; of 10 = 0.333 → 0
    expect(successFee(150, 'EUR', { ...terms, successFeeBp: 333 }).feeCents).toBe(5);
    expect(successFee(15, 'EUR', { ...terms, successFeeBp: 333 }).feeCents).toBe(0);
    // exactly .5 rounds up: 1 bp of 5000 = 0.5 → 1
    expect(successFee(5_000, 'EUR', { ...terms, successFeeBp: 1 }).feeCents).toBe(1);
    expect(successFee(4_999, 'EUR', { ...terms, successFeeBp: 1 }).feeCents).toBe(0);
  });

  it('applies the ceiling', () => {
    expect(successFee(10_000_000, 'EUR', { ...terms, successFeeCapCents: 300_000 })).toMatchObject({ feeCents: 300_000, capped: true });
    expect(successFee(1_000_000, 'EUR', { ...terms, successFeeCapCents: 300_000 })).toMatchObject({ feeCents: 50_000, capped: false });
  });

  it('refuses a currency mismatch instead of converting silently', () => {
    expect(() => successFee(1_000, 'TRY', terms)).toThrow(/TRY/);
  });

  it('validates its inputs', () => {
    expect(() => successFee(-1, 'EUR', terms)).toThrow();
    expect(() => successFee(1.5, 'EUR', terms)).toThrow();
    expect(() => successFee(1_000, 'EUR', { ...terms, successFeeBp: 10_001 })).toThrow();
    expect(() => successFee(1_000, 'EUR', { ...terms, successFeeBp: 2.5 })).toThrow();
    expect(() => successFee(1_000, 'EUR', { ...terms, successFeeCapCents: -1 })).toThrow();
    expect(() => successFee(Number.MAX_SAFE_INTEGER, 'EUR', terms)).toThrow(/safe integer/);
  });
});

import { describe, it, expect } from 'vitest';
import { applyPercentDiscount, currencyExponent, formatMoney, lineNetMinor, sameAmount, toDecimalString, toMinorUnits } from './money';

describe('toMinorUnits', () => {
  it('parses provider decimal strings', () => {
    expect(toMinorUnits('1850.00', 'TRY')).toBe(185_000);
    expect(toMinorUnits('1850', 'TRY')).toBe(185_000);
    expect(toMinorUnits('1850.5', 'TRY')).toBe(185_050);
    expect(toMinorUnits(0, 'TRY')).toBe(0);
  });

  it('rounds half-up past the currency exponent instead of truncating', () => {
    expect(toMinorUnits('10.005', 'TRY')).toBe(1001);
    expect(toMinorUnits('10.004', 'TRY')).toBe(1000);
  });

  it('honours a zero-exponent currency', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(toMinorUnits('1850', 'JPY')).toBe(1850);
  });

  it('throws rather than turning an unparsable amount into 0', () => {
    // 0 would read as "paid nothing" and still activate a subscription.
    expect(() => toMinorUnits('', 'TRY')).toThrow();
    expect(() => toMinorUnits('1.850,00', 'TRY')).toThrow();
    expect(() => toMinorUnits('abc', 'TRY')).toThrow();
    expect(() => toMinorUnits('1e5', 'TRY')).toThrow();
  });
});

describe('toDecimalString', () => {
  it('renders minor units for the wire', () => {
    expect(toDecimalString(185_000, 'TRY')).toBe('1850.00');
    expect(toDecimalString(5, 'TRY')).toBe('0.05');
    expect(toDecimalString(0, 'TRY')).toBe('0.00');
    expect(toDecimalString(1850, 'JPY')).toBe('1850');
    expect(toDecimalString(-5, 'TRY')).toBe('-0.05');
  });

  it('refuses a non-integer amount', () => {
    expect(() => toDecimalString(18.5, 'TRY')).toThrow();
  });

  it('round-trips every price in the TRY list', () => {
    for (const minor of [185_000, 1_776_000, 785_000, 7_536_000, 1_890_000, 43_200_000]) {
      expect(toMinorUnits(toDecimalString(minor, 'TRY'), 'TRY')).toBe(minor);
    }
  });
});

describe('sameAmount', () => {
  it('compares value and currency', () => {
    expect(sameAmount({ amountMinor: 100, currency: 'try' }, { amountMinor: 100, currency: 'TRY' })).toBe(true);
    expect(sameAmount({ amountMinor: 100, currency: 'TRY' }, { amountMinor: 100, currency: 'EUR' })).toBe(false);
  });
});

describe('applyPercentDiscount', () => {
  it('takes a whole percent off in integer arithmetic', () => {
    expect(applyPercentDiscount(8_700, 70)).toBe(2_610);
    expect(applyPercentDiscount(38_700, 70)).toBe(11_610);
    expect(applyPercentDiscount(257_600, 50)).toBe(128_800);
    expect(applyPercentDiscount(4_500, 0)).toBe(4_500);
    expect(applyPercentDiscount(4_500, 100)).toBe(0);
  });

  it('rounds the resulting cent half-up', () => {
    expect(applyPercentDiscount(3_225, 70)).toBe(968); // 967.5
    expect(applyPercentDiscount(3_223, 70)).toBe(967); // 966.9
  });

  it('refuses inputs that would produce a wrong charge silently', () => {
    expect(() => applyPercentDiscount(45.5, 10)).toThrow();
    expect(() => applyPercentDiscount(4_500, 10.5)).toThrow();
    expect(() => applyPercentDiscount(4_500, 101)).toThrow();
    expect(() => applyPercentDiscount(4_500, -1)).toThrow();
    expect(() => applyPercentDiscount(-4_500, 10)).toThrow();
  });
});

describe('formatMoney', () => {
  it('renders the same amount in each locale\u2019s own number format', () => {
    // Same 128_800 cents; the separators move, the value does not.
    expect(formatMoney(128_800, 'USD', 'tr')).toBe('$1.288,00');
    expect(formatMoney(128_800, 'USD', 'en')).toBe('$1,288.00');
  });

  it('always shows the currency\u2019s own number of fraction digits', () => {
    expect(formatMoney(2_610, 'USD', 'en')).toBe('$26.10');
    expect(formatMoney(2_600, 'USD', 'en')).toBe('$26.00');
    // JPY has no minor unit: a ".00" here would invent one.
    expect(formatMoney(2_600, 'JPY', 'en')).toBe('\u00a52,600');
  });

  it('refuses a non-integer amount rather than rendering a rounded one', () => {
    expect(() => formatMoney(26.105, 'USD', 'en')).toThrow();
  });
});

describe('lineNetMinor', () => {
  // Every expectation is a kuruş figure computed by hand in the test name.
  // Nothing here compares the function with a second expression of the same
  // rule — that would prove only that the rule agrees with itself.

  it('multiplies an integer quantity out exactly, with nothing to round', () => {
    expect(lineNetMinor(3, 1999)).toBe(5997);
    expect(lineNetMinor(1, 895_000)).toBe(895_000);
    expect(lineNetMinor(2, 10_000)).toBe(20_000);
  });

  it('rounds a fractional quantity half-up: 0.5 × 113 = 56.5 → 57', () => {
    // The case `invoiceLineSchema` actually permits (`z.number().positive()`):
    // half a day of a ₺1.13 unit. The line has to print 0.56 or 0.57.
    expect(lineNetMinor(0.5, 113)).toBe(57);
  });

  it('rounds a half-kuruş tie up, not to even: 0.5 × 111 = 55.5 → 56', () => {
    // Banker's rounding would give 56 here too, but 55.5 → 56 and 56.5 → 57
    // together rule it out: half-to-even would send 56.5 down to 56.
    expect(lineNetMinor(0.5, 111)).toBe(56);
    expect(lineNetMinor(0.5, 113)).toBe(57);
  });

  it('handles a third of a month: 0.333 × 89500 = 29803.5 → 29804', () => {
    expect(lineNetMinor(0.333, 89_500)).toBe(29_804);
  });

  it('handles one and a half units: 1.5 × 4501 = 6751.5 → 6752', () => {
    expect(lineNetMinor(1.5, 4501)).toBe(6752);
  });

  it('is Math.round, not floor(x + 0.5) — they differ on a real double', () => {
    // 0.49999999999999994 is the largest double below 0.5; adding 0.5 to it
    // rounds up to exactly 1 in binary floating point, so `floor(x + 0.5)`
    // returns 1 where `Math.round` returns 0. A fractional quantity puts
    // arbitrary doubles into this product, and the two call sites this
    // function replaced both ran `Math.round` (TASK-MTU27KSLSJZ9I).
    expect(Math.floor(0.49999999999999994 + 0.5)).toBe(1);
    expect(lineNetMinor(0.49999999999999994, 1)).toBe(0);
  });

  it('gives 0 for a free line, at any quantity', () => {
    // A zero unit price is a real line (a bundled item), not a missing price.
    expect(lineNetMinor(2, 0)).toBe(0);
    expect(lineNetMinor(0.5, 0)).toBe(0);
    expect(lineNetMinor(0, 895_000)).toBe(0);
  });

  it('refuses a negative amount rather than putting a credit on a sale', () => {
    expect(() => lineNetMinor(1, -100)).toThrow();
    expect(() => lineNetMinor(-1, 100)).toThrow();
  });

  it('refuses a unit price that is not already in whole minor units', () => {
    // A major-unit float reaching here is the TASK-MTTUSEJFOSPI bug returning.
    expect(() => lineNetMinor(1, 8.95)).toThrow();
    expect(() => lineNetMinor(1, Number.NaN)).toThrow();
  });

  it('refuses a quantity that is not a finite number', () => {
    expect(() => lineNetMinor(Number.NaN, 100)).toThrow();
    expect(() => lineNetMinor(Number.POSITIVE_INFINITY, 100)).toThrow();
  });

  it('refuses a product outside the safe integer range', () => {
    expect(() => lineNetMinor(1e10, Number.MAX_SAFE_INTEGER)).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { currencyExponent, sameAmount, toDecimalString, toMinorUnits } from './money';

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

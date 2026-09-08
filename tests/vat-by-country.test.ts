import { describe, test, expect } from 'vitest';

import {
  chargeableVatCountries,
  COUNTRY_VAT_RATES,
  findCountryVatRate,
  normaliseCountryKey,
  supportedVatCountries,
} from '@/lib/billing/vat-rates';
import { resolveVatRate, parseVatRate, retiredVatRateSetting } from '@/lib/billing/vat-rate';
import { vatOnNetMinor, grossFromNetMinor } from '@/lib/money';

/**
 * TASK-MTT1WUUS7MN7R — VAT follows the buyer's country.
 *
 * Boss decision, 2026-09-08: catalogue prices are VAT-exclusive and the tax is
 * added by country ("Türkiye %20, Kuveyt %0"). The property this file protects
 * is not the arithmetic — that is easy — but the refusal: a country nobody has
 * sourced gets no rate, and no invoice, rather than a plausible-looking 20%.
 */

describe('the rate table is evidence, not a list of numbers', () => {
  test('every row carries a source and an effective date', () => {
    expect(COUNTRY_VAT_RATES.length).toBeGreaterThan(0);
    for (const row of COUNTRY_VAT_RATES) {
      expect(row.country, 'ISO alpha-2, uppercase').toMatch(/^[A-Z]{2}$/);
      expect(row.ratePercent).toBeGreaterThanOrEqual(0);
      expect(row.ratePercent).toBeLessThanOrEqual(100);
      // A rate with no source is a rate someone remembered.
      expect(row.source.trim().length, `${row.country} has no source`).toBeGreaterThan(10);
      expect(row.effectiveFrom, `${row.country} has no effective date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('the two countries the decision named are both in it, and both chargeable', () => {
    expect(findCountryVatRate('TR')?.ratePercent).toBe(20);
    expect(findCountryVatRate('KW')?.ratePercent).toBe(0);
    expect(supportedVatCountries()).toEqual(expect.arrayContaining(['TR', 'KW']));
    expect(chargeableVatCountries()).toEqual(['TR', 'KW']);
  });

  test('the 27 EU members are present, and every one of them refuses to be charged', () => {
    // Widened by the boss on 2026-09-08. Holding the rate is not a decision to
    // charge it: a Türkiye-resident supplier does not normally charge EU VAT.
    const eu = COUNTRY_VAT_RATES.filter((row) => row.regime === 'unknown');
    expect(eu).toHaveLength(27);
    for (const row of eu) {
      expect(resolveVatRate(row.country).status, row.country).toBe('regime_not_chargeable');
    }
    // The one that breaks a naive integer schema.
    expect(findCountryVatRate('FI')?.ratePercent).toBe(25.5);
    expect(Number.isInteger(findCountryVatRate('FI')!.ratePercent)).toBe(false);
  });

  test('a rate with a fractional percent still yields whole minor units', () => {
    // Finland at 25.5%: the rate has a fraction, the money does not.
    expect(vatOnNetMinor(4500, 25.5)).toBe(1148); // 1147.5 → half-up
    expect(Number.isInteger(vatOnNetMinor(4500, 25.5))).toBe(true);
  });

  test('no country appears twice, so a lookup cannot depend on row order', () => {
    const codes = COUNTRY_VAT_RATES.map((row) => row.country);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('country spellings that actually reach us', () => {
  // `TenantBillingIdentity.buyerCountry` is free text whose schema default is
  // "Türkiye", so an ISO-code-only lookup would fail on the single most common
  // value in the database.
  test.each([
    ['Türkiye', 'TR'],
    ['TÜRKİYE', 'TR'],
    ['türkiye', 'TR'],
    ['  Turkiye  ', 'TR'],
    ['Turkey', 'TR'],
    ['TR', 'TR'],
    ['Kuveyt', 'KW'],
    ['Kuwait', 'KW'],
    ['KW', 'KW'],
  ])('%j resolves to %s', (raw, expected) => {
    expect(findCountryVatRate(raw)?.country).toBe(expected);
  });

  test('the dotted and dotless Turkish i both land on plain I', () => {
    // The reason a plain toUpperCase() is not enough: "Türkiye" upper-cases
    // differently under the invariant and Turkish locales.
    expect(normaliseCountryKey('Türkiye')).toBe('TURKIYE');
    expect(normaliseCountryKey('TÜRKİYE')).toBe('TURKIYE');
    expect(normaliseCountryKey('türkıye')).toBe('TURKIYE');
  });

  test('a country nobody sourced does not resolve to a neighbour', () => {
    // Not "20% because Türkiye is the row next to it". A country that is not in
    // the table has no rate at all — and the EU members that *are* in it are
    // still unchargeable, which the regime test above covers.
    expect(findCountryVatRate('Ruritanya')).toBeNull();
    expect(findCountryVatRate('XX')).toBeNull();
    expect(findCountryVatRate('Norway')).toBeNull();
    expect(findCountryVatRate('')).toBeNull();
    expect(findCountryVatRate(null)).toBeNull();
  });
});

describe('resolveVatRate — the single resolver both the writer and the gate read', () => {
  test('a sourced country resolves with its evidence attached', () => {
    const result = resolveVatRate('Türkiye');
    expect(result).toMatchObject({ status: 'resolved', ratePercent: 20, country: 'TR' });
    if (result.status !== 'resolved') return;
    expect(result.source).toContain('7346');
    expect(result.effectiveFrom).toBe('2023-07-10');
  });

  test('zero is a resolved answer and never a missing one', () => {
    // The distinction the whole decision rests on: Kuwait levies no VAT, which
    // is not the same as nobody having configured a rate.
    const result = resolveVatRate('Kuveyt');
    expect(result).toMatchObject({ status: 'resolved', ratePercent: 0, country: 'KW' });
  });

  test('an unsourced country is refused and the message names the table', () => {
    const result = resolveVatRate('Ruritanya');
    expect(result.status).toBe('country_not_in_table');
    if (result.status !== 'country_not_in_table') return;
    expect(result.detail).toContain('vat-rates.ts');
    expect(result.detail).toContain('TR');
  });

  test('an EU member is refused on its regime, not on a missing rate', () => {
    // Belgium's rate is known (21%) and still may not be charged. The two
    // refusals are reported separately so the fix is obvious: one needs a row,
    // the other needs a ruling.
    const result = resolveVatRate('Belçika');
    expect(result.status).toBe('regime_not_chargeable');
    if (result.status !== 'regime_not_chargeable') return;
    expect(result.country).toBe('BE');
    expect(result.regime).toBe('unknown');
    expect(findCountryVatRate('Belçika')?.ratePercent).toBe(21);
  });

  test.each([undefined, null, '', '   '])('a missing country (%j) is its own reason', (raw) => {
    expect(resolveVatRate(raw).status).toBe('country_missing');
  });
});

describe('INVOICE_VAT_RATE after the decision', () => {
  test('the parser still works — it just no longer decides anything', () => {
    // Kept so a gate can say "set, and ignored" rather than saying nothing.
    expect(parseVatRate('20')).toBe(20);
    expect(retiredVatRateSetting('20')).toBe(20);
    expect(retiredVatRateSetting('abc')).toBeNull();
    expect(retiredVatRateSetting(undefined)).toBeNull();
  });
});

describe('vatOnNetMinor — one rounding rule for the whole system', () => {
  test('adds the tax a VAT-exclusive price attracts', () => {
    expect(vatOnNetMinor(4500, 20)).toBe(900); // $45.00 + 20% = $54.00
    expect(vatOnNetMinor(8700, 20)).toBe(1740);
    expect(vatOnNetMinor(4500, 0)).toBe(0); // Kuveyt
  });

  test('rounds half up, so the same kuruş never falls two ways', () => {
    // 1 minor unit at 50% is exactly 0.5 → 1, not 0.
    expect(vatOnNetMinor(1, 50)).toBe(1);
    // 5 at 10% is exactly 0.5 → 1.
    expect(vatOnNetMinor(5, 10)).toBe(1);
    // 4 at 10% is 0.4 → 0.
    expect(vatOnNetMinor(4, 10)).toBe(0);
  });

  test('gross is always net plus the tax, exactly, with no third number', () => {
    for (const rate of [0, 1, 8, 10, 18, 20]) {
      for (let net = 1; net <= 3000; net += 1) {
        const { netMinor, vatMinor, grossMinor } = grossFromNetMinor(net, rate);
        expect(netMinor).toBe(net);
        expect(vatMinor).toBe(vatOnNetMinor(net, rate));
        expect(netMinor + vatMinor).toBe(grossMinor);
        expect(Number.isInteger(grossMinor)).toBe(true);
      }
    }
  });

  test('refuses inputs that would make the tax a guess', () => {
    expect(() => vatOnNetMinor(10.5, 20)).toThrow(/integers/);
    expect(() => vatOnNetMinor(-1, 20)).toThrow(/non-negative/);
    expect(() => vatOnNetMinor(100, 101)).toThrow(/between 0 and 100/);
    expect(() => vatOnNetMinor(100, -1)).toThrow(/between 0 and 100/);
    expect(() => vatOnNetMinor(100, Number.NaN)).toThrow(/between 0 and 100/);
  });
});

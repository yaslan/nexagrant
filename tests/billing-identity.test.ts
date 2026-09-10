import { describe, expect, test } from 'vitest';

import {
  countryIsInvoiceable,
  maskVknTckn,
  normaliseText,
  normaliseVknTckn,
  parseBillingIdentity,
} from '../src/lib/billing/billing-identity';

/**
 * Synthetic check-digit fixtures, the same two `tests/efatura.test.ts` uses:
 * `1000000000` satisfies the VKN algorithm and `10000000146` the TCKN one.
 * Neither is issued to anybody — a real taxpayer number has no business in a
 * repository (docs/legal/processing-register.md §5).
 */
const VALID_VKN = '1000000000';
const VALID_TCKN = '10000000146';

const complete = {
  buyerName: 'Örnek Teknoloji A.Ş.',
  buyerVknTckn: VALID_VKN,
  buyerTaxOffice: 'Maslak Vergi Dairesi',
  buyerAddress: 'Büyükdere Cad. No: 1',
  buyerCity: 'İstanbul',
  buyerCountry: 'TR',
};

describe('billing identity — normalisation', () => {
  test('collapses the whitespace a PDF paste brings with it', () => {
    expect(normaliseText('  Maslak  Vergi\n Dairesi ')).toBe('Maslak Vergi Dairesi');
  });

  test('strips the punctuation an identity number is quoted with', () => {
    expect(normaliseVknTckn('284 095 817-2')).toBe('2840958172');
    expect(normaliseVknTckn('100.000.000 0')).toBe('1000000000');
  });
});

describe('billing identity — validation', () => {
  test('accepts a complete identity and stores the canonical country code', () => {
    const result = parseBillingIdentity(complete);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('vkn');
    expect(result.values.buyerVknTckn).toBe(VALID_VKN);
    expect(result.values.buyerCountry).toBe('TR');
  });

  test('a country spelled the long way still resolves to its table code', () => {
    const result = parseBillingIdentity({ ...complete, buyerCountry: 'Türkiye' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.buyerCountry).toBe('TR');
  });

  test('11 digits are read as a TCKN and checked with the TCKN algorithm', () => {
    const result = parseBillingIdentity({ ...complete, buyerVknTckn: VALID_TCKN });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe('tckn');
  });

  test('rejects a number whose check digit does not hold', () => {
    const result = parseBillingIdentity({ ...complete, buyerVknTckn: '1234567891' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([{ field: 'buyerVknTckn', code: 'vkn_tckn_checksum' }]);
  });

  test('rejects a length that is neither a VKN nor a TCKN', () => {
    const result = parseBillingIdentity({ ...complete, buyerVknTckn: '123456789' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('vkn_tckn_length');
  });

  test('rejects non-digits rather than silently dropping them', () => {
    const result = parseBillingIdentity({ ...complete, buyerVknTckn: '10000000A46' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('vkn_tckn_not_digits');
  });

  test('reports every missing field at once, not one per submission', () => {
    const result = parseBillingIdentity({
      buyerName: '   ',
      buyerVknTckn: '',
      buyerTaxOffice: '',
      buyerAddress: '',
      buyerCity: '',
      buyerCountry: 'TR',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.field).sort()).toEqual(
      ['buyerAddress', 'buyerCity', 'buyerName', 'buyerTaxOffice', 'buyerVknTckn'].sort()
    );
    expect(result.issues.every((i) => i.code === 'required')).toBe(true);
  });

  test('refuses a country the VAT table cannot price, because it would never invoice', () => {
    const result = parseBillingIdentity({ ...complete, buyerCountry: 'Wakanda' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toEqual({ field: 'buyerCountry', code: 'country_unknown' });
  });

  test('a non-string payload is refused instead of being coerced', () => {
    expect(parseBillingIdentity({ ...complete, buyerVknTckn: 1000000000 }).ok).toBe(false);
    expect(parseBillingIdentity(null).ok).toBe(false);
    expect(parseBillingIdentity('1000000000').ok).toBe(false);
  });

  test('a rejection never carries the submitted value back to the caller', () => {
    const secret = '12345678901';
    const result = parseBillingIdentity({ ...complete, buyerVknTckn: secret });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  test('caps a field rather than letting an unbounded string reach the column', () => {
    const result = parseBillingIdentity({ ...complete, buyerName: 'x'.repeat(201) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toEqual({ field: 'buyerName', code: 'too_long' });
  });
});

describe('billing identity — display', () => {
  test('shows only the last four digits', () => {
    expect(maskVknTckn(VALID_TCKN)).toBe('•••••••0146');
    expect(maskVknTckn(VALID_VKN)).toBe('••••••0000');
  });

  test('a short value is masked entirely rather than exposed', () => {
    expect(maskVknTckn('123')).toBe('•••');
  });
});

describe('billing identity — invoiceability', () => {
  test('Türkiye is chargeable today', () => {
    expect(countryIsInvoiceable('TR')).toBe(true);
  });

  test('an EU country in the table is stored but not yet invoiceable', () => {
    // `vat-rates.ts` carries the 27 members at `regime: 'unknown'` pending a
    // tax ruling; the form has to say so instead of implying an invoice follows.
    expect(countryIsInvoiceable('DE')).toBe(false);
  });

  test('a country outside the table is not invoiceable', () => {
    expect(countryIsInvoiceable('Wakanda')).toBe(false);
  });
});

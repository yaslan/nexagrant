import { describe, test, expect } from 'vitest';
import {
  generateUblTrXml,
  invoiceTotalsMinor,
  type EfaturaDocument,
  type InvoiceLineItem,
} from '../src/lib/efatura';
import { toDecimalString } from '../src/lib/money';

/**
 * The UBL-TR line block used to compute its own amounts on major-unit floats
 * and round them with `toFixed(2)`, while every total on the same document came
 * from `vatOnNetMinor` in src/lib/money.ts. Two rounding rules on one filed
 * document: at 1%, 10% and 18% VAT they disagree by a kuruş, and a fractional
 * quantity moves the line's own net (TASK-MTTUSEJFOSPI, CLAUDE.md rule 9).
 *
 * Every expectation below is a kuruş figure computed by hand in its own test
 * name and checked against the XML text. Nothing here compares one figure the
 * generator produced with another figure the generator produced — that proves
 * only that the generator agrees with itself, which it always did.
 */

const PARTY = {
  name: 'Fabrika Yazılım A.Ş.',
  vknTckn: '3810459281',
  taxOffice: 'Doğanbey V.D.',
  address: 'Kızılırmak Mah. 1450. Cad. No:3',
  city: 'Ankara',
  country: 'Türkiye',
};

function doc(lines: InvoiceLineItem[], currency: EfaturaDocument['currency'] = 'TRY'): EfaturaDocument {
  return {
    id: 'FB-2026-000001',
    uuid: '9b308952-2c1e-4dbd-81da-a2c73bf921d4',
    issueDate: '2026-09-09',
    issueTime: '10:00:00',
    profileId: 'TICARIFATURA',
    invoiceType: 'SATIS',
    currency,
    supplier: PARTY,
    customer: PARTY,
    lines,
  };
}

/** The `<cbc:{tag}>` values inside the `<cac:InvoiceLine>` blocks, in order. */
function lineValues(xml: string, tag: string): string[] {
  const block = xml.slice(xml.indexOf('<cac:InvoiceLine>'));
  return [...block.matchAll(new RegExp(`<cbc:${tag}[^>]*>([^<]*)</cbc:${tag}>`, 'g'))].map(
    (m) => m[1]!
  );
}

/** The `<cbc:{tag}>` values inside `<cac:LegalMonetaryTotal>`. */
function totalValue(xml: string, tag: string): string {
  const block = xml.slice(
    xml.indexOf('<cac:LegalMonetaryTotal>'),
    xml.indexOf('</cac:LegalMonetaryTotal>')
  );
  return new RegExp(`<cbc:${tag}[^>]*>([^<]*)</cbc:${tag}>`).exec(block)![1]!;
}

/** The document-level `<cac:TaxTotal>` block — the one before the lines. */
function documentTaxBlock(xml: string): string {
  const start = xml.indexOf('<!-- Vergi Toplamı -->');
  return xml.slice(start, xml.indexOf('</cac:TaxTotal>', start));
}

describe('the XML line block follows the money.ts rounding rule', () => {
  test('₺10.25 at 18%: 1025 × 18 / 100 = 184.5 kuruş, half-up → 185 = "1.85"', () => {
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Danışmanlık', quantity: 1, unitCode: 'C62', unitPriceMinor: 1025, vatRate: 18 }])
    );
    // The float path printed "1.84": (10.25 * 18) / 100 is 1.845 in binary,
    // which sits just under the tie and `toFixed(2)` rounds down.
    expect(lineValues(xml, 'TaxAmount')).toEqual(['1.85', '1.85']);
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['10.25']);
    expect(lineValues(xml, 'PriceAmount')).toEqual(['10.25']);
  });

  test('₺10.05 at 10%: 1005 × 10 / 100 = 100.5 kuruş, half-up → 101 = "1.01"', () => {
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Konaklama', quantity: 1, unitCode: 'C62', unitPriceMinor: 1005, vatRate: 10 }])
    );
    // The float path printed "1.00".
    expect(lineValues(xml, 'TaxAmount')).toEqual(['1.01', '1.01']);
  });

  test('half a unit of ₺1.13: 0.5 × 113 = 56.5 kuruş, half-up → 57 = "0.57"', () => {
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Yarım gün', quantity: 0.5, unitCode: 'C62', unitPriceMinor: 113, vatRate: 0 }])
    );
    // The float path printed "0.56" for the line's own net, not just its tax.
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['0.57']);
  });

  test('3 × ₺19.99 at 20%: 5997 kuruş net, 5997 × 20 / 100 = 1199.4 → 1199', () => {
    // The case the task proposed. Measured, it does *not* diverge: at 20% the
    // exact product `net × 20 / 100` can never land on a half kuruş (it is
    // `net / 5`, and `net × 2` is even), so there is no tie for the two rules
    // to break differently. Pinned anyway — this is the ordinary Turkish rate
    // and the migration must not move it.
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Abonelik', quantity: 3, unitCode: 'C62', unitPriceMinor: 1999, vatRate: 20 }])
    );
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['59.97']);
    expect(lineValues(xml, 'TaxAmount')).toEqual(['11.99', '11.99']);
    expect(lineValues(xml, 'PriceAmount')).toEqual(['19.99']);
  });
});

describe('zero-rated and withheld lines', () => {
  test('a 0% (Kuveyt) sale of ₺45.00 charges no VAT and says 0.00%, not 20%', () => {
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Fabrika', quantity: 1, unitCode: 'MON', unitPriceMinor: 4500, vatRate: 0 }])
    );
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['45.00']);
    expect(lineValues(xml, 'TaxAmount')).toEqual(['0.00', '0.00']);
    // The document tax block hard-coded `20.00`, so a zero-rated invoice
    // claimed a 20% rate on itself.
    expect(documentTaxBlock(xml)).toContain('<cbc:Percent>0.00</cbc:Percent>');
    expect(documentTaxBlock(xml)).not.toContain('<cbc:Percent>20.00</cbc:Percent>');
    // The buyer pays the list price and nothing more.
    expect(totalValue(xml, 'PayableAmount')).toBe('45.00');
  });

  test('₺100.05 at 20% with 9/10 withholding: VAT 2001, withheld 1800.9 → 1801, payable 200', () => {
    const line: InvoiceLineItem = {
      id: '1',
      name: 'Danışmanlık — ön değerlendirme',
      quantity: 1,
      unitCode: 'MON',
      unitPriceMinor: 10_005,
      vatRate: 20,
      withholdingCode: '604',
      withholdingRate: 0.9,
    };
    const xml = generateUblTrXml(doc([line]));

    // 10005 × 20 / 100 = 2001 exactly; 2001 × 0.9 = 1800.9, half-up → 1801;
    // payable VAT 2001 − 1801 = 200; grand total 10005 + 200 = 10205.
    expect(lineValues(xml, 'TaxAmount')).toEqual(['20.01', '20.01']);
    expect(documentTaxBlock(xml)).toContain('<cbc:TaxAmount currencyID="TRY">2.00</cbc:TaxAmount>');
    expect(totalValue(xml, 'PayableAmount')).toBe('102.05');

    const totals = invoiceTotalsMinor([line]);
    expect(totals.totalVatMinor).toBe(2001);
    expect(totals.totalWithholdingMinor).toBe(1801);
    expect(totals.payableVatMinor).toBe(200);
    expect(totals.grandTotalMinor).toBe(10_205);
  });
});

describe('a multi-line document adds up to itself', () => {
  /**
   * Three lines at three rates, each net and each tax computed by hand:
   *   1. 3 × ₺19.99 @20%  → net 5997, VAT 5997×20/100 = 1199.4  → 1199
   *   2. 1 × ₺10.25 @18%  → net 1025, VAT 1025×18/100 = 184.5   → 185
   *   3. 7 × ₺10.05 @10%  → net 7035, VAT 7035×10/100 = 703.5   → 704
   * Subtotal 5997 + 1025 + 7035 = 14 057; VAT 1199 + 185 + 704 = 2088;
   * tax-inclusive 16 145; payable 16 145 (no withholding).
   */
  const LINES: InvoiceLineItem[] = [
    { id: '1', name: 'Abonelik', quantity: 3, unitCode: 'C62', unitPriceMinor: 1999, vatRate: 20 },
    { id: '2', name: 'Danışmanlık', quantity: 1, unitCode: 'C62', unitPriceMinor: 1025, vatRate: 18 },
    { id: '3', name: 'Konaklama', quantity: 7, unitCode: 'C62', unitPriceMinor: 1005, vatRate: 10 },
  ];

  test('each line prints the hand-computed net and tax', () => {
    const xml = generateUblTrXml(doc(LINES));
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['59.97', '10.25', '70.35']);
    // Two `TaxAmount`s per line: the line total and its single subtotal.
    expect(lineValues(xml, 'TaxAmount')).toEqual([
      '11.99', '11.99',
      '1.85', '1.85',
      '7.04', '7.04',
    ]);
  });

  test('the line nets sum to the document subtotal, to the kuruş', () => {
    const xml = generateUblTrXml(doc(LINES));
    // 5997 + 1025 + 7035 = 14 057 kuruş, added by hand from the values above.
    expect(totalValue(xml, 'LineExtensionAmount')).toBe('140.57');
    expect(totalValue(xml, 'TaxExclusiveAmount')).toBe('140.57');
    expect(totalValue(xml, 'TaxInclusiveAmount')).toBe('161.45'); // 14 057 + 2088
    expect(totalValue(xml, 'PayableAmount')).toBe('161.45');
  });

  test('the line taxes sum to the document tax, per rate and in total', () => {
    const xml = generateUblTrXml(doc(LINES));
    const block = documentTaxBlock(xml);
    // 1199 + 185 + 704 = 2088 kuruş.
    expect(block).toContain('<cbc:TaxAmount currencyID="TRY">20.88</cbc:TaxAmount>');
    // One subtotal per rate, each carrying its own real percentage.
    expect(block).toContain('<cbc:Percent>20.00</cbc:Percent>');
    expect(block).toContain('<cbc:Percent>18.00</cbc:Percent>');
    expect(block).toContain('<cbc:Percent>10.00</cbc:Percent>');
    expect(block).toContain('<cbc:TaxableAmount currencyID="TRY">59.97</cbc:TaxableAmount>');
    expect(block).toContain('<cbc:TaxableAmount currencyID="TRY">10.25</cbc:TaxableAmount>');
    expect(block).toContain('<cbc:TaxableAmount currencyID="TRY">70.35</cbc:TaxableAmount>');
  });

  test('the identity holds for every generated document, not only this one', () => {
    // A structural check *in addition to* the hand-computed figures above: the
    // amounts parsed back out of the XML text must add up. On its own this
    // would prove nothing about the rounding rule — it is here to catch a line
    // that stops being printed at all.
    const xml = generateUblTrXml(doc(LINES));
    const netSum = lineValues(xml, 'LineExtensionAmount').reduce(
      (sum, v) => sum + Math.round(Number(v) * 100),
      0
    );
    expect(toDecimalString(netSum, 'TRY')).toBe(totalValue(xml, 'LineExtensionAmount'));
  });
});

describe('the amounts are minor units of the invoice currency', () => {
  test('a USD invoice prints dollars, from the same integers', () => {
    // $99.00 at 20%: 9900 × 20 / 100 = 1980 cents.
    const xml = generateUblTrXml(
      doc([{ id: '1', name: 'Fabrika Pro', quantity: 1, unitCode: 'MON', unitPriceMinor: 9900, vatRate: 20 }], 'USD')
    );
    expect(lineValues(xml, 'LineExtensionAmount')).toEqual(['99.00']);
    expect(lineValues(xml, 'TaxAmount')).toEqual(['19.80', '19.80']);
    expect(totalValue(xml, 'PayableAmount')).toBe('118.80');
    expect(xml).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
  });
});

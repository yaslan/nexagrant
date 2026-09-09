import { describe, expect, test } from 'vitest';
import { calculateInvoiceTotals, invoiceTotalsMinor, type InvoiceLineItem } from '@/lib/efatura';
import { totalsForLines } from '@/lib/billing/invoice-list';
import { withholdingOnVatMinor, vatOnNetMinor } from '@/lib/money';

/**
 * Withholding (tevkifat) is the part of a line's VAT the buyer pays to the tax
 * office instead of to the seller. Two places quote it for one sale: the
 * document that is filed (`invoiceTotalsMinor` in src/lib/efatura.ts) and the
 * billing panel (`totalsForLines` in src/lib/billing/invoice-list.ts). Each
 * used to hold its own `Math.round(vat * rate)`; they agreed on every input the
 * product produces, but by coincidence — nothing tied them together.
 *
 * Both now call `withholdingOnVatMinor`. This file locks that from two sides,
 * because either one alone can be defeated:
 *
 *   - the equality tests reject a *copy* — reintroduce a local rounding step in
 *     either file and the two figures separate on a fractional product,
 *   - the oracle tests reject a changed *rule* — move the shared helper off
 *     half-up and both sides move together, so equality would still hold while
 *     every figure is wrong.
 *
 * The oracle below is written out in the test rather than imported, so it is an
 * independent statement of the intent and not the implementation checking
 * itself.
 */

/** Half-up on the exact product — the rule, stated independently of the code. */
const expectedWithholding = (vatMinor: number, rate: number) => Math.round(vatMinor * rate);

/** Withholding rates the Turkish codes actually use: 2/10 … 9/10. */
const RATES = [0.2, 0.3, 0.4, 0.5, 0.7, 0.9];

/** 20% is Türkiye; 25.5% (Finland) is the fractional rate a copy trips over. */
const VAT_RATES = [20, 25.5];

function documentLine(netMinor: number, vatRate: number, rate: number): InvoiceLineItem {
  return {
    id: 'l1',
    name: 'Danışmanlık — ön değerlendirme',
    quantity: 1,
    unitCode: 'MON',
    // The document takes a major-unit price; TRY has two decimals, so this is
    // the same `netMinor` the panel is given below.
    unitPrice: netMinor / 100,
    vatRate,
    withholdingCode: '604',
    withholdingRate: rate,
  };
}

describe('the document and the panel withhold the same amount', () => {
  test('every net from 1 to 3000, at each VAT rate and each withholding rate', () => {
    for (const vatRate of VAT_RATES) {
      for (const rate of RATES) {
        for (let net = 1; net <= 3000; net += 1) {
          const label = `net ${net} @ ${vatRate}% VAT, ${rate} withholding`;

          const document = invoiceTotalsMinor([documentLine(net, vatRate, rate)], 'TRY');
          const panel = totalsForLines([
            {
              name: 'Danışmanlık — ön değerlendirme',
              quantity: 1,
              unitCode: 'MON',
              unitPriceMinor: net,
              vatRate,
              withholdingCode: '604',
              withholdingRate: rate,
            },
          ]);

          // First the two against each other. This is the assertion a *copy*
          // trips: put a local rounding step back into either file and the two
          // figures separate here, while both may still look plausible alone.
          expect(panel.withholdingMinor, `panel vs document, ${label}`).toBe(
            document.totalWithholdingMinor
          );
          expect(panel.payableVatMinor, `payable VAT, ${label}`).toBe(document.payableVatMinor);

          // Then the rule itself, against an oracle neither side can influence.
          // This is the assertion a changed *shared* rule trips — there both
          // sides move together, so the equality above still holds.
          const oracle = expectedWithholding(vatOnNetMinor(net, vatRate), rate);
          expect(document.totalWithholdingMinor, `document, ${label}`).toBe(oracle);
          expect(panel.withholdingMinor, `panel, ${label}`).toBe(oracle);
        }
      }
    }
  });

  test('a product ending in exactly half a kuruş rounds up on both sides', () => {
    // 10005 kuruş at 20% is 2001 kuruş of VAT; 9/10 of that is 1800.9, which
    // `Math.floor` would report as 1800. This is the input a floor/half-up
    // disagreement shows up on first.
    const document = invoiceTotalsMinor([documentLine(10_005, 20, 0.9)], 'TRY');
    const panel = totalsForLines([
      {
        name: 'Danışmanlık',
        quantity: 1,
        unitCode: 'MON',
        unitPriceMinor: 10_005,
        vatRate: 20,
        withholdingCode: '604',
        withholdingRate: 0.9,
      },
    ]);

    expect(document.totalVatMinor).toBe(2001);
    expect(document.totalWithholdingMinor).toBe(1801);
    expect(document.payableVatMinor).toBe(200);
    expect(panel.withholdingMinor).toBe(1801);
    expect(panel.payableVatMinor).toBe(200);
  });

  test('the major-unit view reports the same withholding the minor-unit core did', () => {
    const lines = [documentLine(10_005, 20, 0.9)];
    const view = calculateInvoiceTotals(lines, 'TRY');
    const core = invoiceTotalsMinor(lines, 'TRY');

    expect(Math.round(view.totalWithholding * 100)).toBe(core.totalWithholdingMinor);
    expect(Math.round(view.grandTotal * 100)).toBe(core.grandTotalMinor);
  });

  test('a line with no withholding withholds nothing, on both sides', () => {
    const document = invoiceTotalsMinor(
      [{ id: 'l1', name: 'Abonelik', quantity: 1, unitCode: 'MON', unitPrice: 450, vatRate: 20 }],
      'TRY'
    );
    const panel = totalsForLines([
      { name: 'Abonelik', quantity: 1, unitCode: 'MON', unitPriceMinor: 45_000, vatRate: 20 },
    ]);

    expect(document.totalWithholdingMinor).toBe(0);
    expect(panel.withholdingMinor).toBe(0);
    expect(document.payableVatMinor).toBe(document.totalVatMinor);
  });
});

describe('withholdingOnVatMinor guards', () => {
  test('a zero rate is a real answer, not a missing one', () => {
    expect(withholdingOnVatMinor(2000, 0)).toBe(0);
  });

  test('the whole VAT can be withheld (10/10)', () => {
    expect(withholdingOnVatMinor(2001, 1)).toBe(2001);
  });

  test('refuses a fractional or negative VAT amount', () => {
    expect(() => withholdingOnVatMinor(200.5, 0.9)).toThrow(/must be integers/);
    expect(() => withholdingOnVatMinor(-1, 0.9)).toThrow(/non-negative VAT/);
  });

  test('refuses a rate that is not a fraction of the VAT', () => {
    // A percentage passed where a fraction belongs is the mistake this catches:
    // 90 instead of 0.9 would withhold ninety times the tax.
    expect(() => withholdingOnVatMinor(2000, 90)).toThrow(/between 0 and 1/);
    expect(() => withholdingOnVatMinor(2000, -0.1)).toThrow(/between 0 and 1/);
    expect(() => withholdingOnVatMinor(2000, Number.NaN)).toThrow(/between 0 and 1/);
  });
});

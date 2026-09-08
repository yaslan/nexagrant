import { describe, test, expect } from 'vitest';
import {
  buildInvoiceDocument,
  type InvoiceRecord,
} from '../src/app/api/billing/invoices/[id]/export/invoice-document';
import {
  calculateInvoiceTotals,
  generateEfaturaHtml,
  generateUblTrXml,
  foreignCurrencyFilingBlock,
  type EfaturaDocument,
} from '../src/lib/efatura';
import { convertCurrencyMinor } from '../src/lib/money';
import {
  fileThrough,
  isFiled,
  FOREIGN_CURRENCY_FILING_BLOCK,
  type EfaturaIntegrator,
  type FilingOutcome,
} from '../src/lib/efatura-integrator';

/**
 * TASK-MTSWLWDONWA3W — a foreign-currency invoice.
 *
 * The live price catalogue is USD (docs/BILLING.md §1), so `Invoice.currency`
 * on the first real invoice will be USD, not TRY. Two separate defects were
 * measured on that path (evidence:
 * docs/agent-results/TASK-MTSWLWDONWA3W-evidence/):
 *
 *   F-1 the printable document said "Para Birimi: USD" and then printed every
 *       amount with a ₺ prefix — $99.00 rendered as ₺99,00. The renderer had
 *       the symbol hard-coded and the field it read was called `unitPriceTRY`
 *       while holding whatever `currency` said.
 *   F-2 the UBL-TR XML carries no TL equivalent and no exchange rate, which
 *       VUK 215 / 385 require for a domestic foreign-currency invoice. Filling
 *       those in needs a TCMB rate source and an accounting decision that is
 *       still open in docs/adr/ADR-0002-foreign-currency-invoice-fx.md, so the
 *       rule pinned here is the one that holds whichever way that decision
 *       goes: such a document may not be *filed* until it carries the figures.
 */

const SUPPLIER = {
  name: 'Test Tedarikçi A.Ş.',
  vknTckn: '1000000000',
  taxOffice: 'Test V.D.',
  address: 'Test Cad. No:1',
  city: 'Ankara',
};

/** A TR-resident tenant on the USD catalogue: Pro, $99.00/month. */
const USD_RECORD: InvoiceRecord = {
  number: 'FB-2026-000001',
  issuedAt: new Date('2026-09-08T09:00:00.000Z'),
  currency: 'USD',
  buyerName: 'Anadolu Danışmanlık Ltd. Şti.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Kadıköy V.D.',
  buyerAddress: 'Bağdat Cad. No:10',
  buyerCity: 'İstanbul',
  buyerCountry: 'Türkiye',
  lines: [
    { name: 'Fabrika Pro (1 ay)', quantity: 1, unitCode: 'MON', unitPriceMinor: 9900, vatRate: 20 },
  ],
  profileId: 'TICARIFATURA',
  invoiceType: 'SATIS',
  ettn: '5f6b1c2a-0000-4000-8000-000000000001',
  gibEnvelopeId: null,
};

const TRY_RECORD: InvoiceRecord = { ...USD_RECORD, currency: 'TRY' };

function integrator(file: () => Promise<FilingOutcome>): EfaturaIntegrator {
  return { provider: 'test', file };
}

describe('a foreign-currency invoice states its own currency', () => {
  test('the printable document never prints ₺ on an amount that is not TRY', () => {
    const html = generateEfaturaHtml(buildInvoiceDocument(USD_RECORD, SUPPLIER));

    // The header already says USD; the money cells used to disagree with it.
    expect(html).toContain('USD');
    expect(html).not.toContain('₺');
    expect(html).toContain('$99,00');
  });

  test('a TRY invoice still prints ₺ — the fix is currency-aware, not symbol-free', () => {
    const html = generateEfaturaHtml(buildInvoiceDocument(TRY_RECORD, SUPPLIER));
    expect(html).toContain('₺99,00');
    expect(html).not.toContain('$');
  });

  test('the document that reaches the renderer carries the amount under a currency-neutral name', () => {
    const doc = buildInvoiceDocument(USD_RECORD, SUPPLIER);
    // `unitPriceTRY` was the name that let a USD amount be printed as lira.
    expect(doc.lines[0]).not.toHaveProperty('unitPriceTRY');
    expect(doc.lines[0]!.unitPrice).toBe(99);
  });

  test('totals are rounded in the invoice currency, not always in kuruş', () => {
    const doc = buildInvoiceDocument(USD_RECORD, SUPPLIER);
    const totals = calculateInvoiceTotals(doc.lines, doc.currency);
    expect(totals.subtotal).toBe(99);
    expect(totals.totalVat).toBe(19.8);
    expect(totals.grandTotal).toBe(118.8);
  });
});

describe('a foreign-currency invoice may not be filed without its TL figures', () => {
  const usdDoc = (): EfaturaDocument => buildInvoiceDocument(USD_RECORD, SUPPLIER);

  test('the block is named, so a caller can report which figures are missing', () => {
    expect(foreignCurrencyFilingBlock(buildInvoiceDocument(TRY_RECORD, SUPPLIER))).toBeNull();

    const reason = foreignCurrencyFilingBlock(usdDoc());
    expect(reason).toBeTruthy();
    expect(reason).toContain('USD');
    expect(reason).toContain('ADR-0002');
  });

  test('filing a USD document is refused before the adapter is ever reached', async () => {
    let reached = false;
    const outcome = await fileThrough(
      integrator(async () => {
        reached = true;
        return { status: 'filed', envelopeId: 'ENV-1', filedAt: '2026-09-08T09:00:00Z' };
      }),
      usdDoc()
    );

    expect(reached).toBe(false);
    expect(isFiled(outcome)).toBe(false);
    // `blocked`, not `rejected`: nothing left this process, so the refusal
    // cannot be mistaken for the integrator having seen the document.
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') {
      expect(outcome.code).toBe(FOREIGN_CURRENCY_FILING_BLOCK);
      expect(outcome.reason).toContain('ADR-0002');
    }
  });

  test('a TRY document still reaches the adapter', async () => {
    let reached = false;
    const outcome = await fileThrough(
      integrator(async () => {
        reached = true;
        return { status: 'filed', envelopeId: 'ENV-1', filedAt: '2026-09-08T09:00:00Z' };
      }),
      buildInvoiceDocument(TRY_RECORD, SUPPLIER)
    );

    expect(reached).toBe(true);
    expect(isFiled(outcome)).toBe(true);
  });

  test('attaching a recorded exchangeRate clears the filing block and generates UBL-TR exchange rate blocks', async () => {
    const usdRecordWithRate: InvoiceRecord = {
      ...USD_RECORD,
      exchangeRate: {
        sourceCurrency: 'USD',
        targetCurrency: 'TRY',
        calculationRate: 34.5,
        date: '2026-09-08',
      },
    };

    const doc = buildInvoiceDocument(usdRecordWithRate, SUPPLIER);
    expect(foreignCurrencyFilingBlock(doc)).toBeNull();

    const xml = generateUblTrXml(doc);
    expect(xml).toContain('<cac:PricingExchangeRate>');
    expect(xml).toContain('<cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>');
    expect(xml).toContain('<cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode>');
    expect(xml).toContain('<cbc:CalculationRate>34.5000</cbc:CalculationRate>');
    expect(xml).toContain('<cbc:Date>2026-09-08</cbc:Date>');
    expect(xml).toContain('<cac:TaxExchangeRate>');

    let reached = false;
    const outcome = await fileThrough(
      integrator(async () => {
        reached = true;
        return { status: 'filed', envelopeId: 'ENV-FX-1', filedAt: '2026-09-08T09:00:00Z' };
      }),
      doc
    );
    expect(reached).toBe(true);
    expect(isFiled(outcome)).toBe(true);
  });
});

describe('currency conversion arithmetic (convertCurrencyMinor)', () => {
  test('converts minor unit amounts with half-up rounding (0.5 rounds up)', () => {
    // 9900 minor units ($99.00) * 34.50 rate = 3415.5 TRY = 341550 kuruş
    expect(convertCurrencyMinor(9900, 34.5)).toBe(341550);

    // Half-kuruş test: 1005 minor units ($10.05) * 34.565 = 347.37825 TRY -> 34738 kuruş
    expect(convertCurrencyMinor(1005, 34.565)).toBe(34738);

    // Half-kuruş boundary (exact 0.5 fractional kuruş rounds up):
    // 100 minor units * 34.505 = 3450.5 minor units -> rounds to 3451
    expect(convertCurrencyMinor(100, 34.505)).toBe(3451);

    // Below half-kuruş (0.499 rounds down):
    // 100 minor units * 34.5049 = 3450.49 minor units -> rounds to 3450
    expect(convertCurrencyMinor(100, 34.5049)).toBe(3450);
  });
});

/**
 * F-4 (QA round 3, 2026-09-08). Phase 2 of ADR-0002 put the TCMB rate and the
 * TL equivalent on the `Invoice` row and the rate into the UBL-TR exchange-rate
 * blocks. Measured on the real export path, neither figure reached a document a
 * person reads: the printable/PDF invoice — the artefact the buyer receives and
 * an inspector opens — showed "Para Birimi: USD", three dollar amounts, and no
 * rate, no bulletin date and no lira figure anywhere, while the row held
 * ₺4.788,90. The XML stated the rate but no TL amount at all.
 *
 * VUK 215 requires the lira equivalent to be *shown on the invoice*, and this
 * repo's own reading of it says the same (docs/MALI_MUSAVIR_SORULARI.md §6:
 * "üzerine ... TCMB döviz alış kuru ve TL karşılığı" plus the date of the rate
 * actually used). A figure stored in a column no customer can see does not
 * satisfy that.
 */
describe('the TL equivalent is stated on the document, not only stored on the row', () => {
  const RATE = 48.3727;
  const usdWithRate: InvoiceRecord = {
    ...USD_RECORD,
    fxRate: RATE,
    fxRateDate: new Date('2026-09-08T00:00:00.000Z'),
    fxRateSource: 'TCMB',
    // The payable grand total is 118.80 USD (99.00 + 20% VAT).
    grandTotalTryMinor: convertCurrencyMinor(11880, RATE),
  };

  test('the printable invoice shows the rate, the bulletin date and the lira total', () => {
    const html = generateEfaturaHtml(buildInvoiceDocument(usdWithRate, SUPPLIER));

    expect(html).toContain('TCMB');
    expect(html).toContain('48,3727');
    expect(html).toContain('2026-09-08');
    // 11880 * 48.3727 = 574,667.676 kuruş -> ₺5.746,68
    expect(html).toContain('₺5.746,68');
  });

  test('the lira sign appears only on the lira figure — the sale is still in USD', () => {
    const html = generateEfaturaHtml(buildInvoiceDocument(usdWithRate, SUPPLIER));
    // F-1's rule still holds for every amount of the sale itself.
    expect(html).toContain('$118,80');
    expect((html.match(/₺/g) ?? []).length).toBe(1);
  });

  test('the filed XML carries the lira figure, not only the rate to compute it with', () => {
    const xml = generateUblTrXml(buildInvoiceDocument(usdWithRate, SUPPLIER));

    expect(xml).toContain('<cbc:CalculationRate>48.3727</cbc:CalculationRate>');
    expect(xml).toContain('5.746,68 TRY');
    expect(xml).toContain('TCMB');
  });

  test('a TRY invoice gains no exchange-rate line and no note', () => {
    const html = generateEfaturaHtml(buildInvoiceDocument(TRY_RECORD, SUPPLIER));
    const xml = generateUblTrXml(buildInvoiceDocument(TRY_RECORD, SUPPLIER));
    expect(html).not.toContain('TCMB');
    expect(xml).not.toContain('TCMB');
  });

  test('a rate with no recorded lira total prints the rate and invents no total', () => {
    // The pre-assembled path (`record.exchangeRate`) can carry a rate without
    // the row's stored total. The document may not fill that in by multiplying:
    // the figure on a fiscal document is the one it was issued with.
    const handBuilt: InvoiceRecord = {
      ...USD_RECORD,
      exchangeRate: { sourceCurrency: 'USD', targetCurrency: 'TRY', calculationRate: RATE, date: '2026-09-08' },
    };
    const html = generateEfaturaHtml(buildInvoiceDocument(handBuilt, SUPPLIER));
    expect(html).toContain('48,3727');
    expect(html).not.toContain('₺');
  });
});

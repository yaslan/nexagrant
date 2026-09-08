import { describe, test, expect } from 'vitest';
import {
  buildInvoiceDocument,
  type InvoiceRecord,
} from '../src/app/api/billing/invoices/[id]/export/invoice-document';
import {
  calculateInvoiceTotals,
  generateEfaturaHtml,
  foreignCurrencyFilingBlock,
  type EfaturaDocument,
} from '../src/lib/efatura';
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
});

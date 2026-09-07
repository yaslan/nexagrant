import { describe, it, expect } from 'vitest';
import {
  buildInvoiceList,
  latestBuyerIdentity,
  toInvoiceListRow,
  totalsForLines,
  type InvoiceListRecord,
} from '@/lib/billing/invoice-list';

/**
 * The billing panel's invoice history. What is being pinned here is that the
 * list cannot state anything the `Invoice` row does not: no totals without
 * readable lines, no "filed with GİB" without an envelope id, and no buyer
 * identity without an invoice to take it from (TASK-MTRD91ZLKEQ3A).
 */

const LINES = [
  { name: 'Pro Plan (Aylık)', quantity: 1, unitCode: 'MON', unitPriceMinor: 895_000, vatRate: 20 },
];

function record(overrides: Partial<InvoiceListRecord> = {}): InvoiceListRecord {
  return {
    id: 'inv_1',
    number: 'FB-2026-000001',
    issuedAt: new Date('2026-09-01T09:00:00.000Z'),
    currency: 'TRY',
    buyerName: 'Fabrika Beta A.Ş.',
    buyerVknTckn: '1234567890',
    buyerTaxOffice: 'Doğanbey V.D.',
    lines: LINES,
    gibEnvelopeId: null,
    ...overrides,
  };
}

describe('totalsForLines', () => {
  it('adds VAT per line and keeps every amount in minor units', () => {
    const totals = totalsForLines([
      { name: 'a', quantity: 2, unitCode: 'C62', unitPriceMinor: 10_000, vatRate: 20 },
    ]);
    expect(totals.subtotalMinor).toBe(20_000);
    expect(totals.vatMinor).toBe(4_000);
    expect(totals.withholdingMinor).toBe(0);
    expect(totals.totalMinor).toBe(24_000);
  });

  it('subtracts withholding from the VAT the buyer actually pays', () => {
    const totals = totalsForLines([
      {
        name: 'danışmanlık',
        quantity: 1,
        unitCode: 'C62',
        unitPriceMinor: 100_000,
        vatRate: 20,
        withholdingCode: '604',
        withholdingRate: 0.9,
      },
    ]);
    expect(totals.vatMinor).toBe(20_000);
    expect(totals.withholdingMinor).toBe(18_000);
    expect(totals.payableVatMinor).toBe(2_000);
    expect(totals.totalMinor).toBe(102_000);
  });
});

describe('toInvoiceListRow', () => {
  it('reads the description and totals off the stored lines', () => {
    const row = toInvoiceListRow(record());
    expect(row.number).toBe('FB-2026-000001');
    expect(row.description).toBe('Pro Plan (Aylık)');
    expect(row.amounts?.subtotalMinor).toBe(895_000);
    expect(row.amounts?.totalMinor).toBe(1_074_000);
  });

  it('quotes no total when the stored lines cannot be read', () => {
    const row = toInvoiceListRow(record({ lines: { broken: true } }));
    expect(row.amounts).toBeNull();
    expect(row.description).toBe('');
    // The invoice still exists, so the row still appears.
    expect(row.number).toBe('FB-2026-000001');
  });

  it('does not claim a GİB filing without an envelope id', () => {
    expect(toInvoiceListRow(record()).filedWithGib).toBe(false);
    expect(toInvoiceListRow(record({ gibEnvelopeId: '   ' })).filedWithGib).toBe(false);
    expect(toInvoiceListRow(record({ gibEnvelopeId: 'ENV-77' })).filedWithGib).toBe(true);
  });
});

describe('buildInvoiceList', () => {
  it('is empty when the tenant has no invoices — it invents none', () => {
    expect(buildInvoiceList([])).toEqual([]);
  });

  it('lists the newest invoice first', () => {
    const rows = buildInvoiceList([
      record({ id: 'a', number: 'FB-2026-000001', issuedAt: new Date('2026-08-01T00:00:00Z') }),
      record({ id: 'b', number: 'FB-2026-000002', issuedAt: new Date('2026-09-01T00:00:00Z') }),
    ]);
    expect(rows.map((r) => r.number)).toEqual(['FB-2026-000002', 'FB-2026-000001']);
  });
});

describe('latestBuyerIdentity', () => {
  it('has no answer when nothing was ever issued', () => {
    expect(latestBuyerIdentity([])).toBeNull();
  });

  it('takes the identity frozen on the newest invoice', () => {
    const identity = latestBuyerIdentity([
      record({ id: 'a', issuedAt: new Date('2026-08-01T00:00:00Z'), buyerName: 'Eski Unvan' }),
      record({ id: 'b', issuedAt: new Date('2026-09-01T00:00:00Z'), buyerName: 'Yeni Unvan' }),
    ]);
    expect(identity).toEqual({
      name: 'Yeni Unvan',
      vknTckn: '1234567890',
      taxOffice: 'Doğanbey V.D.',
    });
  });
});

import { describe, test, expect } from 'vitest';
import {
  buildInvoiceDocument,
  resolveSupplier,
  SupplierNotConfiguredError,
  InvoiceLinesInvalidError,
  type InvoiceRecord,
} from '../src/app/api/billing/invoices/[id]/export/invoice-document';
import { generateEfaturaHtml, generateUblTrXml } from '../src/lib/efatura';

/**
 * TASK-MTRD9QBJ2G32E — the export document is built from a row and from
 * configuration, never from constants.
 *
 * What it replaced: the route file carried a whole invoice inline — ETTN
 * c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f, supplier VKN 3810459281 at "Maslak
 * Vergi Dairesi", customer VKN 3880194821, `isEfaturaUser: true` — and returned
 * it for any id, to anyone. These tests pin the two rules that make that
 * impossible to reintroduce: nothing about a party may be invented, and a
 * document nobody filed may not claim to be filed.
 */

const SUPPLIER = {
  name: 'Test Tedarikçi A.Ş.',
  vknTckn: '1000000000',
  taxOffice: 'Test V.D.',
  address: 'Test Cad. No:1',
  city: 'Ankara',
};

const RECORD: InvoiceRecord = {
  number: 'FB-2026-000001',
  issuedAt: new Date('2026-09-07T09:15:00.000Z'),
  currency: 'TRY',
  buyerName: 'Alıcı Ltd. Şti.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Doğanbey V.D.',
  buyerAddress: 'ODTÜ Teknokent Blok B',
  buyerCity: 'Ankara',
  buyerCountry: 'Türkiye',
  lines: [
    { name: 'Fabrika Pro Plan (1 ay)', quantity: 1, unitCode: 'C62', unitPriceMinor: 250000, vatRate: 20 },
  ],
  profileId: 'TICARIFATURA',
  invoiceType: 'SATIS',
  ettn: 'dd97ae62-dda9-4cc5-8aef-3001ba0a3791',
  gibEnvelopeId: null,
};

describe('invoice export document', () => {
  describe('supplier identity comes from configuration or not at all', () => {
    test('a complete configuration resolves to the seller party', () => {
      const party = resolveSupplier(SUPPLIER);
      expect(party.vknTckn).toBe('1000000000');
      expect(party.country).toBe('Türkiye'); // the only field with a default
      // Whether Fabrika is a registered e-invoice taxpayer is a fact about its GİB
      // registration. The old route asserted it; nothing here may.
      expect(party.isEfaturaUser).toBeUndefined();
    });

    test('a missing setting is named, not filled in', () => {
      expect(() => resolveSupplier({ ...SUPPLIER, vknTckn: undefined })).toThrow(
        SupplierNotConfiguredError
      );
      try {
        resolveSupplier({});
      } catch (error) {
        expect((error as SupplierNotConfiguredError).missing).toEqual([
          'INVOICE_SUPPLIER_NAME',
          'INVOICE_SUPPLIER_VKN',
          'INVOICE_SUPPLIER_TAX_OFFICE',
          'INVOICE_SUPPLIER_ADDRESS',
          'INVOICE_SUPPLIER_CITY',
        ]);
      }
    });

    test('a blank setting counts as unset — half a config is not half an invoice', () => {
      expect(() => resolveSupplier({ ...SUPPLIER, taxOffice: '   ' })).toThrow(
        SupplierNotConfiguredError
      );
    });
  });

  describe('the document mirrors the row', () => {
    test('identity, dates and amounts all come off the record', () => {
      const doc = buildInvoiceDocument(RECORD, SUPPLIER);
      expect(doc.id).toBe('FB-2026-000001');
      expect(doc.uuid).toBe(RECORD.ettn);
      expect(doc.issueDate).toBe('2026-09-07');
      expect(doc.issueTime).toBe('09:15:00');
      expect(doc.customer.name).toBe('Alıcı Ltd. Şti.');
      expect(doc.customer.vknTckn).toBe('2840958172');
      // 250000 minor units → 2500.00 major, converted once (CLAUDE.md rule 9).
      expect(doc.lines[0]!.unitPrice).toBe(2500);
    });

    test('unreadable stored lines are an error, not an empty invoice', () => {
      expect(() => buildInvoiceDocument({ ...RECORD, lines: [{ name: 'x' }] }, SUPPLIER)).toThrow(
        InvoiceLinesInvalidError
      );
      expect(() => buildInvoiceDocument({ ...RECORD, lines: [] }, SUPPLIER)).toThrow(
        InvoiceLinesInvalidError
      );
    });

    test('none of the retired constants can reappear through this path', () => {
      const doc = buildInvoiceDocument(RECORD, SUPPLIER);
      const rendered = generateUblTrXml(doc) + generateEfaturaHtml(doc);
      for (const fabrication of [
        '3810459281',
        '3880194821',
        'Maslak Vergi Dairesi',
        'c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f',
        'FonBridge Teknoloji',
      ]) {
        expect(rendered).not.toContain(fabrication);
      }
    });
  });

  describe('a document nobody filed does not claim to be filed', () => {
    test('without an envelope id, both outputs say the document has no fiscal value', () => {
      const doc = buildInvoiceDocument(RECORD, SUPPLIER);
      expect(doc.gibEnvelopeId).toBeUndefined();

      const xml = generateUblTrXml(doc);
      expect(xml).toContain('mali değeri yoktur');

      const html = generateEfaturaHtml(doc);
      // The class name is always in the stylesheet; what matters is the element.
      expect(html).toContain('<div class="unfiled-banner">');
      expect(html).toContain('mali değeri yoktur');
      // The sentence the old document ended with, on every export, always.
      expect(html).not.toContain('mali mühür ile onaylanmıştır');
    });

    test('the mark survives printing — it is not inside .no-print', () => {
      const html = generateEfaturaHtml(buildInvoiceDocument(RECORD, SUPPLIER));
      const banner = html.indexOf('<div class="unfiled-banner">');
      const noPrintBlock = html.indexOf('class="no-print"');
      expect(banner).toBeGreaterThan(-1);
      expect(banner).toBeLessThan(noPrintBlock); // outside and above the print-hidden toolbar
    });

    test('with an envelope id, the compliance statement is allowed and cites it', () => {
      const filed = buildInvoiceDocument({ ...RECORD, gibEnvelopeId: 'ENV-2026-000123' }, SUPPLIER);
      const html = generateEfaturaHtml(filed);
      expect(html).toContain('ENV-2026-000123');
      expect(html).not.toContain('<div class="unfiled-banner">');
      expect(generateUblTrXml(filed)).not.toContain('mali değeri yoktur');
    });
  });
});

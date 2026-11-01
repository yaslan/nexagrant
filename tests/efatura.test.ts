import { describe, test, expect } from 'vitest';
import {
  validateVKN,
  validateTCKN,
  calculateInvoiceTotals,
  generateUblTrXml,
  generateEfaturaHtml,
  EfaturaDocument,
} from '../src/lib/efatura';

describe('Turkish E-Invoice (GİB / UBL-TR) Module', () => {
  describe('VKN & TCKN Algorithmic Validation', () => {
    test('validateVKN accepts valid 10-digit VKN', () => {
      // Valid algorithmic test VKNs
      expect(validateVKN('1000000000')).toBe(true);
      expect(validateVKN('1000000018')).toBe(true);
    });

    test('validateVKN rejects invalid length or incorrect checksum', () => {
      expect(validateVKN('123456789')).toBe(false); // 9 digits
      expect(validateVKN('12345678901')).toBe(false); // 11 digits
      expect(validateVKN('1234567891')).toBe(false); // Bad checksum
      expect(validateVKN('abcdefghij')).toBe(false); // Non-digit
    });

    test('validateTCKN accepts valid 11-digit TCKN', () => {
      // 10000000146 is a valid algorithmic checksum test TCKN
      expect(validateTCKN('10000000146')).toBe(true);
    });

    test('validateTCKN rejects invalid starting with 0 or wrong checksum', () => {
      expect(validateTCKN('01234567890')).toBe(false); // Starts with 0
      expect(validateTCKN('11111111111')).toBe(false); // Invalid checksum
    });
  });

  describe('Tax & Withholding Calculations', () => {
    test('calculates standard 20% VAT correctly', () => {
      const lines = [
        {
          id: '1',
          name: 'SaaS Subscription',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 1_000_000,
          vatRate: 20,
        },
      ];

      const totals = calculateInvoiceTotals(lines);
      expect(totals.subtotal).toBe(10000);
      expect(totals.totalVat).toBe(2000);
      expect(totals.totalWithholding).toBe(0);
      expect(totals.payableVat).toBe(2000);
      expect(totals.grandTotal).toBe(12000);
    });

    test('calculates 9/10 Consulting Withholding (Code 604) correctly', () => {
      const lines = [
        {
          id: '1',
          name: 'Horizon Europe Proposal Pre-Evaluation',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 1_000_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9, // 9/10
        },
      ];

      const totals = calculateInvoiceTotals(lines);
      expect(totals.subtotal).toBe(10000);
      expect(totals.totalVat).toBe(2000);
      expect(totals.totalWithholding).toBe(1800); // 2000 * 0.9
      expect(totals.payableVat).toBe(200); // 2000 - 1800
      expect(totals.grandTotal).toBe(10200); // 10000 + 200
    });
  });

  describe('UBL-TR 1.2.1 XML & HTML Generation', () => {
    const mockInvoice: EfaturaDocument = {
      id: 'GIB202600000001',
      uuid: 'c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f',
      issueDate: '2026-09-01',
      issueTime: '12:00:00',
      profileId: 'TICARIFATURA',
      invoiceType: 'SATIS',
      currency: 'TRY',
      supplier: {
        name: 'Fabrika Teknoloji A.Ş.',
        vknTckn: '3810459281',
        taxOffice: 'Maslak V.D.',
        address: 'Büyükdere Cad. 195',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      customer: {
        name: 'Ar-Ge Danışmanlık Ltd.',
        vknTckn: '2840958172',
        taxOffice: 'Doğanbey V.D.',
        address: 'ODTÜ Teknokent',
        city: 'Ankara',
        country: 'Türkiye',
      },
      lines: [
        {
          id: '1',
          name: 'Platform Subscription',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 500_000,
          vatRate: 20,
        },
      ],
    };

    test('generateUblTrXml produces standard compliant UBL-TR XML', () => {
      const xml = generateUblTrXml(mockInvoice);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>');
      expect(xml).toContain('<cbc:ProfileID>TICARIFATURA</cbc:ProfileID>');
      expect(xml).toContain('<cbc:ID>GIB202600000001</cbc:ID>');
      expect(xml).toContain('schemeID="VKN">3810459281</cbc:ID>');
      expect(xml).toContain('<cbc:TaxTypeCode>0015</cbc:TaxTypeCode>');
    });

    test('generateEfaturaHtml produces readable HTML with print button and totals', () => {
      const html = generateEfaturaHtml(mockInvoice);
      expect(html).toContain('E-Fatura - GIB202600000001');
      expect(html).toContain('Fabrika Teknoloji A.Ş.');
      expect(html).toContain('Ar-Ge Danışmanlık Ltd.');
      expect(html).toContain('Platform Subscription');
      expect(html).toContain('ÖDENECEK GENEL TOPLAM:');
    });
  });
});

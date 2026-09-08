import { describe, test, expect } from 'vitest';
import {
  validateVKN,
  validateTCKN,
  calculateInvoiceTotals,
  generateUblTrXml,
  generateEfaturaHtml,
  isFiledWithGib,
  UNFILED_NOTICE,
  type EfaturaDocument,
} from '../src/lib/efatura';
import {
  createSandboxAdapter,
  fileInvoice,
  fileThrough,
  isFiled,
  resolveIntegrator,
} from '../src/lib/efatura-integrator';
import { parseVatRate } from '../src/lib/billing/vat-rate';
import { evaluatePreflight } from '../scripts/efatura-preflight';

describe('e-Fatura Engine — Comprehensive Unit Tests', () => {
  describe('VKN (Vergi Kimlik Numarası) Algorithmic Checksum Validation', () => {
    test('accepts algorithmically valid synthetic 10-digit VKNs', () => {
      // Valid synthetic VKNs constructed according to the GİB VKN modulo 9/10 algorithm
      expect(validateVKN('1000000000')).toBe(true);
      expect(validateVKN('1000000105')).toBe(true);
      expect(validateVKN('1000000201')).toBe(true);
      expect(validateVKN('1000000306')).toBe(true);
    });

    test('rejects invalid VKN length, non-digits, and incorrect checksums', () => {
      expect(validateVKN('123456789')).toBe(false); // 9 digits
      expect(validateVKN('12345678901')).toBe(false); // 11 digits
      expect(validateVKN('1000000001')).toBe(false); // Bad checksum
      expect(validateVKN('ABCDEFGHIJ')).toBe(false); // Non-digit
      expect(validateVKN('')).toBe(false);
    });
  });

  describe('TCKN (TC Kimlik Numarası) Algorithmic Checksum Validation', () => {
    test('accepts algorithmically valid synthetic 11-digit TCKNs', () => {
      // 10000000146 is a valid TCKN checksum
      expect(validateTCKN('10000000146')).toBe(true);
    });

    test('rejects TCKNs starting with 0, wrong length, or bad checksum', () => {
      expect(validateTCKN('01000000146')).toBe(false); // Starts with 0
      expect(validateTCKN('1000000014')).toBe(false); // 10 digits
      expect(validateTCKN('100000001469')).toBe(false); // 12 digits
      expect(validateTCKN('11111111111')).toBe(false); // Invalid checksum
      expect(validateTCKN('10000000145')).toBe(false); // Wrong checksum digit
    });
  });

  describe('Invoice Totals & Money Minor Unit Arithmetic', () => {
    test('calculates standard 20% VAT using minor unit kuruş precision', () => {
      const lines = [
        {
          id: '1',
          name: 'Platform Subscription',
          quantity: 2,
          unitCode: 'C62',
          unitPrice: 2500, // 5000.00 TRY total
          vatRate: 20,
        },
      ];

      const totals = calculateInvoiceTotals(lines);
      expect(totals.subtotal).toBe(5000);
      expect(totals.totalVat).toBe(1000);
      expect(totals.totalWithholding).toBe(0);
      expect(totals.payableVat).toBe(1000);
      expect(totals.grandTotal).toBe(6000);
    });

    test('calculates 9/10 withholding (Code 604) correctly with kuruş rounding', () => {
      const lines = [
        {
          id: '1',
          name: 'Consulting Service',
          quantity: 1,
          unitCode: 'C62',
          unitPrice: 10000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9,
        },
      ];

      const totals = calculateInvoiceTotals(lines);
      expect(totals.subtotal).toBe(10000);
      expect(totals.totalVat).toBe(2000);
      expect(totals.totalWithholding).toBe(1800); // 2000 * 0.9
      expect(totals.payableVat).toBe(200);
      expect(totals.grandTotal).toBe(10200);
    });
  });

  describe('UBL-TR 1.2.1 XML Generator', () => {
    const mockDocument: EfaturaDocument = {
      id: 'GIB202600000001',
      uuid: '9b308952-2c1e-4dbd-81da-a2c73bf921d4',
      issueDate: '2026-09-08',
      issueTime: '14:30:00',
      profileId: 'TICARIFATURA',
      invoiceType: 'SATIS',
      currency: 'TRY',
      supplier: {
        name: 'Fabrika Yazılım A.Ş.',
        vknTckn: '3810459281',
        taxOffice: 'Doğanbey V.D.',
        address: 'Kızılırmak Mah. 1450. Cad. No:3',
        city: 'Ankara',
        country: 'Türkiye',
      },
      customer: {
        name: 'Müşteri Danışmanlık Ltd.',
        vknTckn: '2840958172',
        taxOffice: 'Maslak V.D.',
        address: 'Büyükdere Cad. No:100',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      lines: [
        {
          id: '1',
          name: 'EU Horizon Europe Advisory Service',
          quantity: 1,
          unitCode: 'MON',
          unitPrice: 15000,
          vatRate: 20,
        },
      ],
    };

    test('generates well-formed XML with all UBL-TR 1.2.1 mandatory tags', () => {
      const xml = generateUblTrXml(mockDocument);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
      expect(xml).toContain('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>');
      expect(xml).toContain('<cbc:ProfileID>TICARIFATURA</cbc:ProfileID>');
      expect(xml).toContain('<cbc:ID>GIB202600000001</cbc:ID>');
      expect(xml).toContain('<cbc:UUID>9b308952-2c1e-4dbd-81da-a2c73bf921d4</cbc:UUID>');
      expect(xml).toContain('<cbc:IssueDate>2026-09-08</cbc:IssueDate>');
      expect(xml).toContain('<cbc:IssueTime>14:30:00</cbc:IssueTime>');
      expect(xml).toContain('<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>');
      expect(xml).toContain('<cac:AccountingSupplierParty>');
      expect(xml).toContain('<cac:AccountingCustomerParty>');
      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cac:LegalMonetaryTotal>');
      expect(xml).toContain('<cac:InvoiceLine>');
    });

    test('includes UNFILED_NOTICE watermark note in XML when document has no gibEnvelopeId', () => {
      const xml = generateUblTrXml(mockDocument);
      expect(xml).toContain(UNFILED_NOTICE);
      expect(isFiledWithGib(mockDocument)).toBe(false);
    });

    test('removes UNFILED_NOTICE note in XML when gibEnvelopeId is present', () => {
      const filedDocument: EfaturaDocument = {
        ...mockDocument,
        gibEnvelopeId: 'ENV-2026-9999',
      };
      const xml = generateUblTrXml(filedDocument);
      expect(xml).not.toContain(UNFILED_NOTICE);
      expect(isFiledWithGib(filedDocument)).toBe(true);
    });

    test('generateEfaturaHtml includes UNFILED_NOTICE banner when unfiled', () => {
      const html = generateEfaturaHtml(mockDocument);
      expect(html).toContain(UNFILED_NOTICE);
      expect(html).toContain('ÖRNEK BELGE');
    });
  });

  describe('Sandbox Integrator Adapter', () => {
    const sandboxConfig = {
      provider: 'sandbox',
      baseUrl: 'https://sandbox.efatura.local',
      username: 'test_user',
      password: 'test_password',
      testMode: true,
    };

    const mockDocument: EfaturaDocument = {
      id: 'FB-2026-000001',
      uuid: '9b308952-2c1e-4dbd-81da-a2c73bf921d4',
      issueDate: '2026-09-08',
      issueTime: '15:00:00',
      profileId: 'TICARIFATURA',
      invoiceType: 'SATIS',
      currency: 'TRY',
      supplier: {
        name: 'Fabrika Yazılım A.Ş.',
        vknTckn: '3810459281',
        taxOffice: 'Doğanbey V.D.',
        address: 'Adres',
        city: 'Ankara',
        country: 'Türkiye',
      },
      customer: {
        name: 'Alıcı Ltd.',
        vknTckn: '2840958172',
        taxOffice: 'Maslak V.D.',
        address: 'Adres',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      lines: [{ id: '1', name: 'Test Service', quantity: 1, unitCode: 'C62', unitPrice: 1000, vatRate: 20 }],
    };

    test('resolves sandbox adapter from ADAPTERS registry', () => {
      const adapter = resolveIntegrator(sandboxConfig);
      expect(adapter).not.toBeNull();
      expect(adapter?.provider).toBe('sandbox');
    });

    test('executes send path end-to-end BUT leaves document unfiled and returns non-filed outcome', async () => {
      const adapter = resolveIntegrator(sandboxConfig)!;
      const outcome = await fileThrough(adapter, mockDocument);

      expect(isFiled(outcome)).toBe(false);
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') {
        expect(outcome.code).toBe('SANDBOX_SAMPLE');
        expect(outcome.message).toBe(UNFILED_NOTICE);
      }

      // Document itself remains unfiled with GİB
      expect(isFiledWithGib(mockDocument)).toBe(false);
      expect(generateUblTrXml(mockDocument)).toContain(UNFILED_NOTICE);
    });

    test('refuses to run sandbox adapter in live production mode (testMode === false)', async () => {
      const liveSandboxConfig = {
        ...sandboxConfig,
        testMode: false,
      };

      // Direct instantiation throws error
      expect(() => createSandboxAdapter(liveSandboxConfig)).toThrow(
        /ONLY be used when EFATURA_INTEGRATOR_TEST_MODE is enabled/i
      );

      // Through fileInvoice / fileThrough returns unreachable outcome with error message
      const outcome = await fileInvoice(mockDocument, {
        provider: 'sandbox',
        baseUrl: 'https://sandbox.efatura.local',
        username: 'user',
        password: 'pass',
        testMode: 'false',
      });

      expect(isFiled(outcome)).toBe(false);
      expect(outcome.status).toBe('unreachable');
      if (outcome.status === 'unreachable') {
        expect(outcome.detail).toMatch(/EFATURA_INTEGRATOR_TEST_MODE/i);
      }
    });
  });

  describe('Preflight Script Verification', () => {
    test('Scenario (a): No env vars set -> no invoice record, no document, no GİB send', () => {
      const report = evaluatePreflight({});

      expect(report.supplierConfigured).toBe(false);
      expect(report.vatConfigured).toBe(false);
      expect(report.integratorConfigured).toBe(false);
      expect(report.invoiceRecordVerdict).toContain('Fatura kaydı hiç oluşturulmaz');
      expect(report.documentGenVerdict).toContain('üretilmez');
      expect(report.gibSendVerdict).toContain("GİB'e gönderilmez, sebep:");
      expect(report.allMissingVars).toContain('INVOICE_SUPPLIER_NAME');
      expect(report.allMissingVars).toContain('INVOICE_VAT_RATE');
      expect(report.allMissingVars).toContain('EFATURA_INTEGRATOR_PROVIDER');
    });

    test('Scenario (b): Seller identity and VAT set -> document generation true, GİB send false', () => {
      const supplierOnlyEnv = {
        INVOICE_SUPPLIER_NAME: 'Fabrika Yazılım A.Ş.',
        INVOICE_SUPPLIER_VKN: '3810459281',
        INVOICE_SUPPLIER_TAX_OFFICE: 'Doğanbey V.D.',
        INVOICE_SUPPLIER_ADDRESS: 'Kızılırmak Mah. No:3',
        INVOICE_SUPPLIER_CITY: 'Ankara',
        INVOICE_VAT_RATE: '20',
      };

      const report = evaluatePreflight(supplierOnlyEnv);

      expect(report.supplierConfigured).toBe(true);
      expect(report.vatConfigured).toBe(true);
      expect(report.integratorConfigured).toBe(false);
      expect(report.invoiceRecordVerdict).toBe('Fatura kaydı oluşturulur');
      expect(report.documentGenVerdict).toBe('Fatura belgesi üretilir');
      expect(report.gibSendVerdict).toContain("GİB'e gönderilmez, sebep: EFATURA_INTEGRATOR_PROVIDER");
    });

    test('Scenario (c): All set with synthetic values -> document generation true, GİB send true', () => {
      const completeEnv = {
        INVOICE_SUPPLIER_NAME: 'Fabrika Yazılım A.Ş.',
        INVOICE_SUPPLIER_VKN: '3810459281',
        INVOICE_SUPPLIER_TAX_OFFICE: 'Doğanbey V.D.',
        INVOICE_SUPPLIER_ADDRESS: 'Kızılırmak Mah. No:3',
        INVOICE_SUPPLIER_CITY: 'Ankara',
        INVOICE_VAT_RATE: '20',
        EFATURA_INTEGRATOR_PROVIDER: 'sandbox',
        EFATURA_INTEGRATOR_BASE_URL: 'https://efatura-test.ornek.com',
        EFATURA_INTEGRATOR_USERNAME: 'fabrika_api',
        EFATURA_INTEGRATOR_PASSWORD: 'test_password_123',
        EFATURA_INTEGRATOR_TEST_MODE: 'true',
      };

      const report = evaluatePreflight(completeEnv);

      expect(report.supplierConfigured).toBe(true);
      expect(report.vatConfigured).toBe(true);
      expect(report.integratorConfigured).toBe(true);
      expect(report.documentGenVerdict).toBe('Fatura belgesi üretilir');
      expect(report.gibSendVerdict).toBe("GİB'e gönderilir");
      expect(report.summarySentence).toBe(
        "Fatura kaydı oluşturulur. Fatura belgesi üretilir. GİB'e gönderilir."
      );
    });

    // The bug this block exists for: every other variable filled in and the
    // gate green, while `createInvoiceForPayment` writes nothing at all
    // because the VAT rate is missing or unusable (TASK-MTSYAKDK5LV9E).
    describe('INVOICE_VAT_RATE is the thirteenth required variable', () => {
      const everythingElse = {
        INVOICE_SUPPLIER_NAME: 'Fabrika Yazılım A.Ş.',
        INVOICE_SUPPLIER_VKN: '3810459281',
        INVOICE_SUPPLIER_TAX_OFFICE: 'Doğanbey V.D.',
        INVOICE_SUPPLIER_ADDRESS: 'Kızılırmak Mah. No:3',
        INVOICE_SUPPLIER_CITY: 'Ankara',
        EFATURA_INTEGRATOR_PROVIDER: 'sandbox',
        EFATURA_INTEGRATOR_BASE_URL: 'https://efatura-test.ornek.com',
        EFATURA_INTEGRATOR_USERNAME: 'fabrika_api',
        EFATURA_INTEGRATOR_PASSWORD: 'test_password_123',
        EFATURA_INTEGRATOR_TEST_MODE: 'true',
      };

      test('all twelve other variables set but VAT missing -> gate is red', () => {
        const report = evaluatePreflight(everythingElse);

        expect(report.supplierConfigured).toBe(true);
        expect(report.integratorConfigured).toBe(true);
        expect(report.vatConfigured).toBe(false);
        expect(report.allMissingVars).toEqual(['INVOICE_VAT_RATE']);
        expect(report.gibSendVerdict).toContain('INVOICE_VAT_RATE');
      });

      test('the verdict names the record, the alert and the untouched payment', () => {
        const report = evaluatePreflight(everythingElse);

        expect(report.invoiceRecordVerdict).toContain('Fatura kaydı hiç oluşturulmaz');
        expect(report.invoiceRecordVerdict).toContain('vat_rate_not_configured');
        expect(report.invoiceRecordVerdict).toContain('ödeme etkilenmez');
        expect(report.documentGenVerdict).toContain('üretilecek kayıt yoktur');
      });

      test.each(['abc', '-1', '101', '', '   ', 'NaN', '1e999'])(
        'a value the invoice writer rejects (%j) is GEÇERSİZ here too, never dolu',
        (raw) => {
          const report = evaluatePreflight({ ...everythingElse, INVOICE_VAT_RATE: raw });

          // The gate and the writer read one rule, so they cannot disagree.
          expect(parseVatRate(raw)).toBeNull();
          expect(report.vatConfigured).toBe(false);
          expect(report.missingVatVars).toEqual(['INVOICE_VAT_RATE']);

          const row = report.variableResults.find((r) => r.variable === 'INVOICE_VAT_RATE');
          expect(row?.status).not.toBe('dolu');
        }
      );

      test.each(['0', '20', ' 18 ', '100'])('a rate the writer accepts (%j) turns the gate green', (raw) => {
        const report = evaluatePreflight({ ...everythingElse, INVOICE_VAT_RATE: raw });

        expect(parseVatRate(raw)).not.toBeNull();
        expect(report.vatConfigured).toBe(true);
        expect(report.allMissingVars).toEqual([]);
        expect(report.gibSendVerdict).toBe("GİB'e gönderilir");
      });
    });
  });
});

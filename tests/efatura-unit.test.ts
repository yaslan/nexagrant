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
          unitPriceMinor: 250_000, // 5000.00 TRY total for quantity 2
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
          unitPriceMinor: 1_000_000,
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
          unitPriceMinor: 1_500_000,
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
      lines: [{ id: '1', name: 'Test Service', quantity: 1, unitCode: 'C62', unitPriceMinor: 100_000, vatRate: 20 }],
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
    test('Scenario (a): No env vars set -> no document, no GİB send; the VAT block is not an env question', () => {
      const report = evaluatePreflight({});

      expect(report.supplierConfigured).toBe(false);
      expect(report.integratorConfigured).toBe(false);

      // Changed by TASK-MTT1WUUS7MN7R and worth stating plainly: an empty
      // environment still knows what Turkish VAT is, because the rate lives in
      // src/lib/billing/vat-rates.ts and the supplier country defaults to
      // Türkiye. There is no longer a variable to forget here — which is the
      // point of moving the rate out of the environment.
      expect(report.vatConfigured).toBe(true);

      // A record can be written; the document and the filing still cannot.
      expect(report.invoiceRecordVerdict).toBe('Fatura kaydı oluşturulur');
      expect(report.documentGenVerdict).toContain('üretilmez');
      expect(report.gibSendVerdict).toContain("GİB'e gönderilmez, sebep:");
      expect(report.allMissingVars).toContain('INVOICE_SUPPLIER_NAME');
      expect(report.allMissingVars).toContain('EFATURA_INTEGRATOR_PROVIDER');
    });

    test('Scenario (b): Seller identity and VAT set -> document generation true, GİB send false', () => {
      const supplierOnlyEnv = {
        INVOICE_SUPPLIER_NAME: 'Fabrika Yazılım A.Ş.',
        INVOICE_SUPPLIER_VKN: '3810459281',
        INVOICE_SUPPLIER_TAX_OFFICE: 'Doğanbey V.D.',
        INVOICE_SUPPLIER_ADDRESS: 'Kızılırmak Mah. No:3',
        INVOICE_SUPPLIER_CITY: 'Ankara',
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

    // The bug the original block existed for (TASK-MTSYAKDK5LV9E): every other
    // variable filled in and the gate green, while `createInvoiceForPayment`
    // writes nothing at all because the VAT rate is unusable. The bug is the
    // same; what decides the rate is not.
    //
    // Since 2026-09-08 (TASK-MTT1WUUS7MN7R) the rate comes from the *buyer's*
    // country, so no environment variable can be the thirteenth required one —
    // and the setting that used to be was deleted on 2026-09-09
    // (TASK-MTTTMECDO7RC8). The property worth pinning is unchanged: the gate
    // and the writer read one rule, so the gate cannot go green on a sale the
    // writer will refuse.
    describe('the VAT block follows the buyer country table, not the environment', () => {
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

      test('with no tax variable at all the gate is green: Türkiye has a sourced rate', () => {
        const report = evaluatePreflight(everythingElse);

        expect(report.supplierConfigured).toBe(true);
        expect(report.integratorConfigured).toBe(true);
        expect(report.vatConfigured).toBe(true);
        expect(report.allMissingVars).toEqual([]);
        expect(report.gibSendVerdict).toBe("GİB'e gönderilir");
      });

      test('the tax block offers no variable to set — one row, and it is the country rate', () => {
        // What the operator reads is the point. While a retired variable was
        // still listed here (as "ignored"), the boss's own setup document kept
        // calling it required. One row, named after the country and not after
        // an environment variable, is what leaves no second thing to configure.
        const report = evaluatePreflight({ ...everythingElse, SOME_RETIRED_TAX_VAR: '20' });

        const vatRows = report.variableResults.filter((r) => r.block === 'Vergi (KDV)');
        expect(vatRows).toHaveLength(1);
        expect(vatRows[0]?.variable).toBe('KDV oranı (Türkiye)');
        expect(vatRows[0]?.status).toBe('dolu');
        expect(report.vatConfigured).toBe(true);
        expect(report.allMissingVars).toEqual([]);
      });

      test('the resolved domestic rate is shown, so the operator can check it', () => {
        const report = evaluatePreflight(everythingElse);

        const row = report.variableResults.find((r) => r.variable.startsWith('KDV oranı'));
        expect(row?.status).toBe('dolu');
        expect(row?.valueMasked).toBe('%20 (TR)');
        // The green verdict sentence is deliberately unchanged from before this
        // rule landed; the rate itself is what the operator reads, in the row.
        expect(report.invoiceRecordVerdict).toBe('Fatura kaydı oluşturulur');
      });

      test('a supplier country with no sourced rate turns the gate red and names the table', () => {
        // Not a variable to set: the fix is a row with a source in
        // src/lib/billing/vat-rates.ts, and the verdict has to say so.
        const report = evaluatePreflight({
          ...everythingElse,
          INVOICE_SUPPLIER_COUNTRY: 'Ruritanya',
        });

        expect(report.vatConfigured).toBe(false);
        expect(report.missingVatVars).toEqual(['vat-rates.ts:Ruritanya']);
        expect(report.invoiceRecordVerdict).toContain('vat-rates.ts');
        expect(report.invoiceRecordVerdict).toContain('invoice_vat_country_unknown');
        expect(report.documentGenVerdict).toContain('üretilecek kayıt yoktur');
        expect(report.gibSendVerdict).toContain('vat-rates.ts:Ruritanya');
      });
    });
  });
});

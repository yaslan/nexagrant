import { describe, test, expect } from 'vitest';
import {
  generateUblTrXml,
  withholdingRateLabel,
  type EfaturaDocument,
} from '../src/lib/efatura';

/**
 * Line-level withholding tax (tevkifat) subtotals in UBL-TR XML.
 *
 * Commit 18106a4 added line-level TaxSubtotal blocks for withholding:
 * each line now prints its own KDV TaxSubtotal and (if withholdingRate > 0)
 * its own Tevkifat TaxSubtotal.
 *
 * These tests verify that the XML structure is correct:
 *   - TaxableAmount = VAT for the withholding block
 *   - TaxAmount = withholdingMinor (the deducted amount)
 *   - Percent = withholding rate as a percentage (0.9 → "90.00")
 *   - TaxTypeCode matches the withholdingCode
 *   - Line TaxTotal/TaxAmount = sum of both TaxSubtotal TaxAmounts
 *   - Invalid rates (not exact tenths) are rejected
 *   - Multi-line invoices sum correctly
 *   - Lines without withholding carry only KDV TaxSubtotal
 */

// Helper to parse TaxSubtotal blocks from XML line
function parseTaxSubtotalsFromLineXml(lineXml: string): Array<{
  taxableAmount: string;
  taxAmount: string;
  percent: string;
  name: string;
  typeCode: string;
}> {
  const subtotals: Array<{
    taxableAmount: string;
    taxAmount: string;
    percent: string;
    name: string;
    typeCode: string;
  }> = [];

  // Match all <cac:TaxSubtotal>...</cac:TaxSubtotal> blocks
  const subtotalPattern = /<cac:TaxSubtotal>(.*?)<\/cac:TaxSubtotal>/gs;
  let match;

  while ((match = subtotalPattern.exec(lineXml)) !== null) {
    const subtotalBlock = match[1]!;

    const taxableMatch = /<cbc:TaxableAmount[^>]*>([^<]+)<\/cbc:TaxableAmount>/.exec(subtotalBlock);
    const taxAmountMatch = /<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/.exec(subtotalBlock);
    const percentMatch = /<cbc:Percent>([^<]+)<\/cbc:Percent>/.exec(subtotalBlock);
    const nameMatch = /<cbc:Name>([^<]+)<\/cbc:Name>/.exec(subtotalBlock);
    const typeCodeMatch = /<cbc:TaxTypeCode>([^<]+)<\/cbc:TaxTypeCode>/.exec(subtotalBlock);

    subtotals.push({
      taxableAmount: taxableMatch?.[1] ?? '',
      taxAmount: taxAmountMatch?.[1] ?? '',
      percent: percentMatch?.[1] ?? '',
      name: nameMatch?.[1] ?? '',
      typeCode: typeCodeMatch?.[1] ?? '',
    });
  }

  return subtotals;
}

// Helper to extract line total tax amount from line XML
function getLineTotalTaxAmount(lineXml: string): string {
  const match = /<cbc:TaxAmount currencyID="[^"]*">([^<]+)<\/cbc:TaxAmount>/.exec(lineXml);
  return match?.[1] ?? '';
}

// Mock document base
const mockDocumentBase: EfaturaDocument = {
  id: 'GIB202600000001',
  uuid: '9b308952-2c1e-4dbd-81da-a2c73bf921d4',
  issueDate: '2026-09-09',
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
  lines: [],
};

describe('Line-level Withholding TaxSubtotal XML Structure', () => {
  test('(a) single line with 20% VAT + 9/10 withholding produces two TaxSubtotal blocks', () => {
    // 10,000 kuruş (100 TRY) @ 20% VAT = 2,000 kuruş VAT
    // 9/10 withholding on 2,000 kuruş = 1,800 kuruş withheld
    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Consulting Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9,
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Extract the line block from XML
    const lineMatch = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/s.exec(xml);
    expect(lineMatch).not.toBeNull();
    const lineXml = lineMatch![1]!;

    // Parse TaxSubtotal blocks
    const subtotals = parseTaxSubtotalsFromLineXml(lineXml);

    // Should have exactly 2 TaxSubtotal blocks: KDV and Tevkifat
    expect(subtotals).toHaveLength(2);

    // First TaxSubtotal: KDV
    expect(subtotals[0]!.name).toBe('KDV');
    expect(subtotals[0]!.typeCode).toBe('0015');
    expect(subtotals[0]!.percent).toBe('20.00');
    expect(subtotals[0]!.taxableAmount).toBe('100.00'); // Net amount
    expect(subtotals[0]!.taxAmount).toBe('20.00'); // VAT amount

    // Second TaxSubtotal: Tevkifat
    expect(subtotals[1]!.name).toBe('Tevkifat');
    expect(subtotals[1]!.typeCode).toBe('604');
    expect(subtotals[1]!.percent).toBe('90.00'); // 0.9 * 100 = 90%
    expect(subtotals[1]!.taxableAmount).toBe('20.00'); // TaxableAmount = VAT amount
    expect(subtotals[1]!.taxAmount).toBe('18.00'); // Withholding amount (2000 * 0.9 / 100 = 18.00)
  });

  test('(b) line TaxTotal/TaxAmount equals sum of TaxSubtotal TaxAmount values', () => {
    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Consulting Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9,
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Extract the line block
    const lineMatch = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/s.exec(xml);
    expect(lineMatch).not.toBeNull();
    const lineXml = lineMatch![1]!;

    // Get line TaxTotal amount
    const lineTotalTaxAmountStr = getLineTotalTaxAmount(lineXml);
    const lineTotalTaxAmount = parseFloat(lineTotalTaxAmountStr);

    // Parse TaxSubtotal blocks
    const subtotals = parseTaxSubtotalsFromLineXml(lineXml);

    // Sum of TaxAmount from all TaxSubtotal blocks
    const sumOfSubtotals = subtotals.reduce((sum, sub) => sum + parseFloat(sub.taxAmount), 0);

    // Should be equal
    expect(lineTotalTaxAmount).toBeCloseTo(sumOfSubtotals, 2);
  });

  test('(c) invalid withholding rate (0.67) returns empty label and no Tevkifat TaxSubtotal', () => {
    // Verify withholdingRateLabel rejects non-exact-tenth rates
    expect(withholdingRateLabel(0.67)).toBe('');

    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Consulting Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.67, // Invalid rate
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Extract the line block
    const lineMatch = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/s.exec(xml);
    expect(lineMatch).not.toBeNull();
    const lineXml = lineMatch![1]!;

    // Parse TaxSubtotal blocks
    const subtotals = parseTaxSubtotalsFromLineXml(lineXml);

    // Should have only 1 TaxSubtotal: KDV (no Tevkifat because rate is invalid)
    expect(subtotals).toHaveLength(1);
    expect(subtotals[0]!.name).toBe('KDV');
  });

  test('(d) multi-line invoice document payable VAT equals sum of per-line contributions', () => {
    // Line 1: 100 TRY @ 20% = 20 TRY VAT, 90% withheld = 18 TRY withheld, payable = 2 TRY
    // Line 2: 150 TRY @ 20% = 30 TRY VAT, 50% withheld = 15 TRY withheld, payable = 15 TRY
    // Document payable VAT = 2 + 15 = 17 TRY
    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Consulting Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9,
        },
        {
          id: '2',
          name: 'Advisory Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 15_000,
          vatRate: 20,
          withholdingCode: '605',
          withholdingRate: 0.5,
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Document TaxTotal/TaxAmount shows the payable VAT (after withholding)
    const docTaxMatch = /<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/s.exec(xml);
    expect(docTaxMatch).not.toBeNull();
    const docPayableVat = parseFloat(docTaxMatch![1]!);

    // Expected: (10*0.2 - 10*0.2*0.9) + (15*0.2 - 15*0.2*0.5) = 2 + 15 = 17
    expect(docPayableVat).toBe(17); // 2 + 15 TRY
  });

  test('(e) invoice without withholding has no Tevkifat TaxSubtotal in any line', () => {
    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Regular Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          // No withholding
        },
        {
          id: '2',
          name: 'Another Service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 5_000,
          vatRate: 20,
          // No withholding
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Extract all line blocks
    const linePattern = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/gs;
    let lineMatch;
    let lineCount = 0;

    while ((lineMatch = linePattern.exec(xml)) !== null) {
      lineCount++;
      const lineXml = lineMatch[1]!;
      const subtotals = parseTaxSubtotalsFromLineXml(lineXml);

      // Each line should have exactly 1 TaxSubtotal (KDV only)
      expect(subtotals, `line ${lineCount} should have only KDV`).toHaveLength(1);
      expect(subtotals[0]!.name).toBe('KDV');
    }

    expect(lineCount).toBe(2);
  });

  test('withholding rates at all valid tenths produce correct percent values', () => {
    const validRates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

    for (const rate of validRates) {
      const doc: EfaturaDocument = {
        ...mockDocumentBase,
        lines: [
          {
            id: '1',
            name: 'Service',
            quantity: 1,
            unitCode: 'C62',
            unitPriceMinor: 10_000,
            vatRate: 20,
            withholdingCode: '604',
            withholdingRate: rate,
          },
        ],
      };

      const xml = generateUblTrXml(doc);
      const lineMatch = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/s.exec(xml);
      expect(lineMatch).not.toBeNull();
      const lineXml = lineMatch![1]!;

      const subtotals = parseTaxSubtotalsFromLineXml(lineXml);
      expect(subtotals).toHaveLength(2);

      const withholding = subtotals[1]!;
      const expectedPercent = (rate * 100).toFixed(2);
      expect(withholding.percent).toBe(expectedPercent);
      expect(withholdingRateLabel(rate)).toBe(`${Math.round(rate * 10)}/10`);
    }
  });

  test('line with mixed VAT rates and withholding on one line only', () => {
    const doc: EfaturaDocument = {
      ...mockDocumentBase,
      lines: [
        {
          id: '1',
          name: 'Consulting with withholding',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 20,
          withholdingCode: '604',
          withholdingRate: 0.9,
        },
        {
          id: '2',
          name: 'Regular service',
          quantity: 1,
          unitCode: 'C62',
          unitPriceMinor: 10_000,
          vatRate: 18, // Different VAT rate
          // No withholding
        },
      ],
    };

    const xml = generateUblTrXml(doc);

    // Extract lines
    let lineNum = 0;
    const linePattern = /<cac:InvoiceLine>(.*?)<\/cac:InvoiceLine>/gs;
    let lineMatch;

    while ((lineMatch = linePattern.exec(xml)) !== null) {
      lineNum++;
      const lineXml = lineMatch[1]!;
      const subtotals = parseTaxSubtotalsFromLineXml(lineXml);

      if (lineNum === 1) {
        // First line: with withholding
        expect(subtotals).toHaveLength(2);
        expect(subtotals[1]!.name).toBe('Tevkifat');
      } else if (lineNum === 2) {
        // Second line: no withholding
        expect(subtotals).toHaveLength(1);
        expect(subtotals[0]!.name).toBe('KDV');
      }
    }
  });
});

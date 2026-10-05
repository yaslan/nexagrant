import { describe, test, expect } from 'vitest';
import {
  GIB_TURKISH_TERMS,
  UNFILED_NOTICE,
  generateEfaturaHtml,
  generateUblTrXml,
  type EfaturaDocument,
  type InvoiceLineItem,
} from '../src/lib/efatura';
import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * The printed invoice, in both languages (TASK-MTTUSZF4QSFGU).
 *
 * Two things are locked here, and they pull in opposite directions:
 *
 *   (B) The labels that describe the *page* — "Ara Toplam", "Hesaplanan KDV",
 *       the column headings — come from `messages/<locale>.json` under `invoice.*`,
 *       so an English session does not download a Turkish page (CLAUDE.md rule 8).
 *
 *   (A) The words that name something GİB defined — VKN, TCKN, ETTN, e-Fatura,
 *       KDV, Tevkifat, and the UBL-TR code values TICARIFATURA / TEVKIFAT — stay
 *       Turkish in *every* locale, and the filed XML is not localised at all.
 *
 * Test 3 is the one that matters most: a future "translate everything" pass that
 * renders `<cbc:Name>VAT</cbc:Name>` into a document filed with GİB fails here.
 */

const party = (name: string, vknTckn: string) => ({
  name,
  vknTckn,
  taxOffice: 'Maslak',
  address: 'Test Cad. 1',
  city: 'İstanbul',
  country: 'Türkiye',
});

function invoiceWith(lines: InvoiceLineItem[], invoiceType: EfaturaDocument['invoiceType'] = 'SATIS'): EfaturaDocument {
  return {
    id: 'GIB202600000001',
    uuid: '00000000-0000-4000-8000-000000000001',
    issueDate: '2026-09-10',
    issueTime: '10:00:00',
    profileId: 'TICARIFATURA',
    invoiceType,
    currency: 'TRY',
    supplier: party('Fabrika A.Ş.', '1000000105'),
    customer: party('Alıcı Ltd.', '1000000201'),
    lines,
  };
}

/** A monthly subscription line — the shape `invoice-writer.ts` actually writes. */
const monthlyLine = (vatRate: number, withholdingRate?: number): InvoiceLineItem => ({
  id: '1',
  name: 'Fabrika Pro (1 ay)',
  quantity: 1,
  unitCode: 'MON',
  unitPriceMinor: 250000,
  vatRate,
  ...(withholdingRate ? { withholdingCode: '604', withholdingRate } : {}),
});

describe('printed invoice — (B) product labels are translated', () => {
  test('the Turkish page is what it always was: catalogue entries, not new wording', () => {
    const html = generateEfaturaHtml(invoiceWith([monthlyLine(20, 0.9)], 'TEVKIFAT'));
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('Ara Toplam (Matrah):');
    expect(html).toContain('Hesaplanan KDV (%20):');
    expect(html).toContain('Tevkifat Tutarı (9/10):');
    expect(html).toContain('ÖDENECEK GENEL TOPLAM:');
    expect(html).toContain('SAYIN (ALICI)');
  });

  test('the English page carries no Turkish product label', () => {
    const html = generateEfaturaHtml(invoiceWith([monthlyLine(20, 0.9)], 'TEVKIFAT'), 'en');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Subtotal (taxable base):');
    expect(html).toContain('TOTAL PAYABLE:');
    expect(html).toContain('BILL TO (BUYER)');
    for (const turkish of [
      'Ara Toplam',
      'ÖDENECEK GENEL TOPLAM',
      'SAYIN (ALICI)',
      'FATURA DETAYLARI',
      'Hizmet / Ürün Açıklaması',
      'Birim Fiyat',
      'Faturayı Yazdır',
    ]) {
      expect(html).not.toContain(turkish);
    }
  });

  test('the withholding rate is read off the lines in either language, not hard-coded', () => {
    for (const [rate, label] of [
      [0.9, '9/10'],
      [0.5, '5/10'],
    ] as const) {
      const doc = invoiceWith([monthlyLine(20, rate)], 'TEVKIFAT');
      expect(generateEfaturaHtml(doc)).toContain(`Tevkifat Tutarı (${label}):`);
      expect(generateEfaturaHtml(doc, 'en')).toContain(`Withholding — tevkifat (${label}):`);
    }
  });

  test('the VAT rate is read off the lines, and written the way each language writes a percentage', () => {
    for (const rate of [20, 10, 0]) {
      expect(generateEfaturaHtml(invoiceWith([monthlyLine(rate)]))).toContain(
        `Hesaplanan KDV (%${rate}):`
      );
      expect(generateEfaturaHtml(invoiceWith([monthlyLine(rate)]), 'en')).toContain(
        `VAT charged (${rate}%):`
      );
    }
  });

  test('an invoice with no withholding prints no withholding row in either language', () => {
    const doc = invoiceWith([monthlyLine(20)]);
    expect(generateEfaturaHtml(doc)).not.toContain('Tevkifat Tutarı');
    expect(generateEfaturaHtml(doc, 'en')).not.toContain('tevkifat (');
  });
});

describe('printed invoice — the unit comes from the line, not from a constant', () => {
  test('a MON line is billed in months, not in pieces', () => {
    // The page said "1 Adet" for every line while the filed XML said unitCode="MON",
    // so the two documents described the same sale differently.
    expect(generateEfaturaHtml(invoiceWith([monthlyLine(20)]))).toContain('1 Ay');
    expect(generateEfaturaHtml(invoiceWith([monthlyLine(20)]), 'en')).toContain('1 month');
  });

  test('a C62 line is still billed in pieces', () => {
    const line = { ...monthlyLine(20), unitCode: 'C62', quantity: 3 };
    expect(generateEfaturaHtml(invoiceWith([line]))).toContain('3 Adet');
    expect(generateEfaturaHtml(invoiceWith([line]), 'en')).toContain('3 pcs');
  });

  test('an unrecognised unit code prints the code rather than guessing a word', () => {
    const line = { ...monthlyLine(20), unitCode: 'KGM' };
    const html = generateEfaturaHtml(invoiceWith([line]));
    expect(html).toContain('1 KGM');
    expect(html).not.toContain('1 Adet');
  });
});

describe('printed invoice — (A) GİB terms stay Turkish everywhere', () => {
  test('the English page still names GİB things by their GİB names', () => {
    const html = generateEfaturaHtml(invoiceWith([monthlyLine(20, 0.9)], 'TEVKIFAT'), 'en');
    // Identifiers and document type — no English equivalent exists in the legislation.
    expect(html).toContain(`${GIB_TURKISH_TERMS.vkn}:`);
    expect(html).toContain(`${GIB_TURKISH_TERMS.ettn}:`);
    expect(html).toContain(GIB_TURKISH_TERMS.eFatura);
    // UBL-TR code values, printed straight off the document.
    expect(html).toContain('TICARIFATURA');
    expect(html).toContain('TEVKIFAT');
    // The word "tevkifat" survives in the English withholding label on purpose:
    // it is what the buyer has to quote back.
    expect(html).toContain('tevkifat');
  });

  test('a TCKN buyer is labelled TCKN in English too', () => {
    const doc = invoiceWith([monthlyLine(20)]);
    doc.customer = { ...doc.customer, vknTckn: '10000000146' };
    expect(generateEfaturaHtml(doc, 'en')).toContain(`${GIB_TURKISH_TERMS.tckn}:`);
  });

  test('the filed XML is not localised — no locale can reach it', () => {
    const doc = invoiceWith([monthlyLine(20, 0.9)], 'TEVKIFAT');
    const xml = generateUblTrXml(doc);
    expect(xml).toContain(`<cbc:Name>${GIB_TURKISH_TERMS.kdvSchemeName}</cbc:Name>`);
    expect(xml).toContain(`<cbc:Name>${GIB_TURKISH_TERMS.withholdingSchemeName}</cbc:Name>`);
    expect(xml).not.toContain('<cbc:Name>VAT</cbc:Name>');
    expect(xml).not.toContain('<cbc:Name>Withholding</cbc:Name>');
    // `generateUblTrXml` takes no locale argument at all, which is the structural
    // half of the same guarantee.
    expect(generateUblTrXml.length).toBe(1);
  });

  test('the unfiled note the XML files stays Turkish while the page is translated', () => {
    const doc = invoiceWith([monthlyLine(20)]);
    expect(generateUblTrXml(doc)).toContain(UNFILED_NOTICE);
    expect(generateEfaturaHtml(doc, 'en')).not.toContain(UNFILED_NOTICE);
    expect(generateEfaturaHtml(doc, 'en')).toContain('SAMPLE DOCUMENT');
    expect(generateEfaturaHtml(doc)).toContain(UNFILED_NOTICE);
  });
});

describe('invoice.* catalogue', () => {
  test('both languages carry the same key set (CLAUDE.md rule 8)', () => {
    expect(Object.keys(enMessages.invoice).sort()).toEqual(Object.keys(trMessages.invoice).sort());
  });

  test('no entry is left as an untranslated copy of the Turkish one', () => {
    const shared = Object.entries(trMessages.invoice).filter(
      ([key, tr]) => enMessages.invoice[key as keyof typeof enMessages.invoice] === tr
    );
    expect(shared).toEqual([]);
  });
});

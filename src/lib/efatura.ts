/**
 * GİB (Gelir İdaresi Başkanlığı) E-Fatura & E-Arşiv Motoru
 * UBL-TR 1.2.1 XML Standartları, VKN/TCKN Algoritmik Doğrulaması, KDV & Tevkifat Hesaplamaları
 */

import { currencyExponent, toMinorUnits } from './money';

export interface InvoiceParty {
  name: string;
  vknTckn: string; // 10 digits for VKN, 11 digits for TCKN
  taxOffice: string;
  address: string;
  city: string;
  country: string;
  email?: string;
  isEfaturaUser?: boolean;
}

export interface InvoiceLineItem {
  id: string;
  name: string;
  quantity: number;
  unitCode: string; // 'C62' (Adet), 'MON' (Ay)
  unitPrice: number;
  vatRate: number; // 20 for 20%
  withholdingCode?: string; // e.g. '604' (Danışmanlık 9/10)
  withholdingRate?: number; // 0.9 for 9/10
}

export interface EfaturaDocument {
  id: string; // e.g. "GIB202600000001"
  uuid: string;
  issueDate: string; // "YYYY-MM-DD"
  issueTime: string; // "HH:mm:ss"
  profileId: 'TICARIFATURA' | 'TEMELFATURA' | 'EARSIVFATURA';
  invoiceType: 'SATIS' | 'ISTISNA' | 'TEVKIFAT';
  currency: 'TRY' | 'EUR' | 'USD';
  supplier: InvoiceParty;
  customer: InvoiceParty;
  lines: InvoiceLineItem[];
  notes?: string[];
  /**
   * The envelope id GİB returns once the document has actually been filed
   * through an e-invoice integrator. Absent means it never was.
   *
   * The generators below read only this field to decide whether the document
   * may describe itself as a filed invoice. A document without it is stamped —
   * in the XML and across the printable page — as carrying no fiscal value, and
   * no caller can turn that stamp off. `src/app/api/billing/invoices/[id]/export`
   * once shipped a hard-coded supplier VKN, tax office and ETTN with a footer
   * claiming a fiscal seal; that document was never filed anywhere
   * (TASK-MTRD9QBJ2G32E).
   */
  gibEnvelopeId?: string;
}

export interface TaxCalculationResult {
  subtotal: number;
  totalVat: number;
  totalWithholding: number;
  payableVat: number;
  grandTotal: number;
}

/**
 * Wording used wherever a document that was never filed with GİB has to say so.
 * One string, so the XML note and the printed page cannot drift apart.
 */
export const UNFILED_NOTICE =
  'ÖRNEK BELGE — GİB\'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.';

/**
 * Why this document may not be *filed* with GİB, or null when nothing blocks it.
 *
 * VUK 215 lets an invoice be denominated in a foreign currency only while it
 * also shows the Turkish lira equivalent, and 385 Sıra No.lu Genel Tebliğ makes
 * that mandatory for a domestic transaction, at the TCMB buying rate of the
 * issue date (VUK 280). Fabrika carries neither the rate nor the TL figures:
 * there is no TCMB rate source, no field to put one in, and the shape of the
 * fix — including how a genuine export (ISTISNA) is told apart from a domestic
 * sale, which is the case that would relax this rule — is the open decision in
 * docs/adr/ADR-0002-foreign-currency-invoice-fx.md.
 *
 * Until that lands the filing is refused rather than guessed. A rate this code
 * invented would be a fabricated figure on a fiscal document, and a filing
 * without one is a VUK 352 II-7 usulsüzlük. Rendering and export are
 * deliberately untouched: an unfiled document already stamps itself as carrying
 * no fiscal value, so the customer keeps their receipt while the fiscal filing
 * waits (TASK-MTSWLWDONWA3W).
 */
export function foreignCurrencyFilingBlock(invoice: EfaturaDocument): string | null {
  if (invoice.currency === 'TRY') return null;
  return (
    `${invoice.currency} faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez ` +
    `(VUK 215 / 385 Sira No.lu Genel Teblig). Karar bekliyor: ` +
    `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`
  );
}

/** True only for a document that carries an envelope id GİB actually returned. */
export function isFiledWithGib(invoice: EfaturaDocument): boolean {
  return typeof invoice.gibEnvelopeId === 'string' && invoice.gibEnvelopeId.trim().length > 0;
}

/**
 * 10 haneli VKN (Vergi Kimlik Numarası) Matematiksel Algoritma Doğrulaması
 */
export function validateVKN(vkn: string): boolean {
  if (!vkn || vkn.length !== 10 || !/^\d{10}$/.test(vkn)) {
    return false;
  }

  const digits = vkn.split('').map(Number);
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    const digit = digits[i]!;
    const temp = (digit + (9 - i)) % 10;
    let computed = (temp * Math.pow(2, 9 - i)) % 9;
    if (temp !== 0 && computed === 0) {
      computed = 9;
    }
    sum += computed;
  }

  const lastDigit = (10 - (sum % 10)) % 10;
  return lastDigit === digits[9];
}

/**
 * 11 haneli TCKN (TC Kimlik Numarası) Algoritma Doğrulaması
 */
export function validateTCKN(tckn: string): boolean {
  if (!tckn || tckn.length !== 11 || !/^[1-9]\d{10}$/.test(tckn)) {
    return false;
  }

  const digits = tckn.split('').map(Number);
  const oddSum = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!;
  const evenSum = digits[1]! + digits[3]! + digits[5]! + digits[7]!;

  const digit10 = (oddSum * 7 - evenSum) % 10;
  if (digit10 !== digits[9]) return false;

  const totalFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const digit11 = totalFirst10 % 10;

  return digit11 === digits[10];
}

/** ISO-4217 codes an invoice may be denominated in. */
export type InvoiceCurrency = EfaturaDocument['currency'];

/**
 * KDV, Tevkifat ve Toplam Tutar Hesaplayıcı
 * Tutarlar Int minor unit bazında hesaplanır (CLAUDE.md #9).
 *
 * The currency is an argument because the minor unit is not always kuruş: the
 * rounding step belongs to the invoice's own currency, and this used to round
 * every invoice as if it were TRY.
 */
export function calculateInvoiceTotals(
  lines: InvoiceLineItem[],
  currency: InvoiceCurrency = 'TRY'
): TaxCalculationResult {
  let subtotalMinor = 0;
  let totalVatMinor = 0;
  let totalWithholdingMinor = 0;
  const majorUnit = 10 ** currencyExponent(currency);

  for (const line of lines) {
    const lineTotalMinor = toMinorUnits(line.quantity * line.unitPrice, currency);
    const vatMinor = Math.round((lineTotalMinor * line.vatRate) / 100);
    let withholdingMinor = 0;

    if (line.withholdingRate && line.withholdingRate > 0) {
      withholdingMinor = Math.round(vatMinor * line.withholdingRate);
    }

    subtotalMinor += lineTotalMinor;
    totalVatMinor += vatMinor;
    totalWithholdingMinor += withholdingMinor;
  }

  const payableVatMinor = totalVatMinor - totalWithholdingMinor;
  const grandTotalMinor = subtotalMinor + payableVatMinor;

  return {
    subtotal: subtotalMinor / majorUnit,
    totalVat: totalVatMinor / majorUnit,
    totalWithholding: totalWithholdingMinor / majorUnit,
    payableVat: payableVatMinor / majorUnit,
    grandTotal: grandTotalMinor / majorUnit,
  };
}

/**
 * Renders an amount in the invoice's own currency, in the Turkish number
 * format the printed document uses.
 *
 * The lira sign used to be hard-coded into every money cell while the box two
 * rows above said "Para Birimi: USD": a $99.00 subscription printed as a lira
 * amount, so the document contradicted itself about what was owed and
 * understated it by whatever the day's rate was (TASK-MTSWLWDONWA3W). The
 * symbol now comes from the same field as that box.
 */
export function formatInvoiceAmount(amount: number, currency: InvoiceCurrency): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: currencyExponent(currency),
  }).format(amount);
}

/**
 * Resmî GİB UBL-TR 1.2.1 Standart XML Çıktısı Üretici
 */
export function generateUblTrXml(invoice: EfaturaDocument): string {
  const totals = calculateInvoiceTotals(invoice.lines, invoice.currency);

  const linesXml = invoice.lines
    .map(
      (line, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${invoice.currency}">${(line.quantity * line.unitPrice).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${invoice.currency}">${((line.quantity * line.unitPrice * line.vatRate) / 100).toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${invoice.currency}">${(line.quantity * line.unitPrice).toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${invoice.currency}">${((line.quantity * line.unitPrice * line.vatRate) / 100).toFixed(2)}</cbc:TaxAmount>
          <cbc:Percent>${line.vatRate}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme>
              <cbc:Name>KDV</cbc:Name>
              <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${line.name}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${invoice.currency}">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${invoice.profileId}</cbc:ProfileID>
  <cbc:ID>${invoice.id}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${invoice.uuid}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${invoice.invoiceType}</cbc:InvoiceTypeCode>${
    isFiledWithGib(invoice)
      ? ''
      : `
  <cbc:Note>${UNFILED_NOTICE}</cbc:Note>`
  }
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>

  <!-- Tedarikçi / Satıcı Bilgileri -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${invoice.supplier.vknTckn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${invoice.supplier.name}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${invoice.supplier.address}</cbc:StreetName>
        <cbc:CityName>${invoice.supplier.city}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${invoice.supplier.country}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${invoice.supplier.taxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Müşteri Bilgileri -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${invoice.customer.vknTckn.length === 11 ? 'TCKN' : 'VKN'}">${invoice.customer.vknTckn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${invoice.customer.name}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${invoice.customer.address}</cbc:StreetName>
        <cbc:CityName>${invoice.customer.city}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${invoice.customer.country}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${invoice.customer.taxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- Vergi Toplamı -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${invoice.currency}">${totals.payableVat.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${invoice.currency}">${totals.subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${invoice.currency}">${totals.totalVat.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>20.00</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- Parasal Toplamlar -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${totals.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${totals.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${(totals.subtotal + totals.totalVat).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${totals.grandTotal.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Fatura Kalemleri -->
  ${linesXml}
</Invoice>`;
}

/**
 * GİB UBL-TR düzenine göre biçimlenmiş, yazdırılabilir HTML / PDF görünümü.
 *
 * "Onaylı" değildir ve öyle demez: bu şablon bir belgeyi biçimlendirir, GİB'e
 * göndermez. Gönderildiğini yalnız `gibEnvelopeId` kanıtlar; o yoksa çıktı
 * kendini `UNFILED_NOTICE` ile mali değeri olmayan bir örnek olarak işaretler.
 */
export function generateEfaturaHtml(invoice: EfaturaDocument): string {
  const totals = calculateInvoiceTotals(invoice.lines, invoice.currency);
  const money = (amount: number) => formatInvoiceAmount(amount, invoice.currency);

  const linesHtml = invoice.lines
    .map(
      (l, idx) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${l.name}</strong></td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${l.quantity} Adet</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${money(l.unitPrice)}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">%${l.vatRate}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: bold;">${money(l.quantity * l.unitPrice)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${isFiledWithGib(invoice) ? '' : 'ÖRNEK — '}E-Fatura - ${invoice.id}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10pt; line-height: 1.5; }
    .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .company-title { font-size: 14pt; font-weight: bold; color: #1e3a8a; }
    .doc-type { font-size: 16pt; font-weight: bold; color: #b91c1c; text-align: right; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .party-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; }
    .party-title { font-weight: bold; font-size: 11pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9.5pt; }
    th { background: #0f172a; color: #fff; padding: 8px; text-align: left; }
    .totals-table { width: 45%; margin-left: auto; border: none; }
    .totals-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
    .totals-table td.label { font-weight: bold; color: #475569; }
    .grand-total { background: #f1f5f9; font-size: 11pt; font-weight: bold; color: #0f172a; }
    .footer { font-size: 8pt; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; }
    /* Deliberately not inside .no-print: the mark has to survive the printout
       and the PDF, which is exactly where an unfiled document would otherwise
       start looking like a filed one. */
    .unfiled-banner {
      border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d;
      font-weight: bold; text-align: center; padding: 10px; border-radius: 6px;
      margin-bottom: 14px; letter-spacing: 0.02em;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${
    isFiledWithGib(invoice)
      ? ''
      : `<div class="unfiled-banner">${UNFILED_NOTICE}</div>`
  }
  <div class="no-print" style="background:#f1f5f9; padding:10px; text-align:right; margin-bottom:15px;">
    <button onclick="window.print()" style="background:#1e3a8a; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer;">
      🖨️ Faturayı Yazdır / PDF İndir
    </button>
  </div>

  <div class="header-box">
    <div>
      <div class="company-title">${invoice.supplier.name}</div>
      <div style="font-size: 8.5pt; color: #475569; margin-top: 4px;">
        ${invoice.supplier.address} - ${invoice.supplier.city} / ${invoice.supplier.country}<br>
        Vergi Dairesi: ${invoice.supplier.taxOffice} | VKN: ${invoice.supplier.vknTckn}
      </div>
    </div>
    <div>
      <div class="doc-type">${invoice.profileId === 'EARSIVFATURA' ? 'e-Arşiv Fatura' : 'e-Fatura'}</div>
      <div style="font-size: 9pt; font-family: monospace; text-align: right; color: #334155;">
        <strong>Fatura No:</strong> ${invoice.id}<br>
        <strong>Tarih:</strong> ${invoice.issueDate}<br>
        <strong>ETTN:</strong> ${invoice.uuid}
      </div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="party-box">
      <div class="party-title">SAYIN (ALICI)</div>
      <strong>${invoice.customer.name}</strong><br>
      ${invoice.customer.address} - ${invoice.customer.city} / ${invoice.customer.country}<br>
      <strong>Vergi Dairesi:</strong> ${invoice.customer.taxOffice}<br>
      <strong>${invoice.customer.vknTckn.length === 11 ? 'TCKN' : 'VKN'}:</strong> ${invoice.customer.vknTckn}
    </div>

    <div class="party-box">
      <div class="party-title">FATURA DETAYLARI</div>
      <strong>Senaryo:</strong> ${invoice.profileId}<br>
      <strong>Fatura Tipi:</strong> ${invoice.invoiceType}<br>
      <strong>Düzenleme Zamanı:</strong> ${invoice.issueDate} ${invoice.issueTime}<br>
      <strong>Para Birimi:</strong> ${invoice.currency}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">Sıra</th>
        <th style="width: 45%;">Hizmet / Ürün Açıklaması</th>
        <th style="width: 10%; text-align: center;">Miktar</th>
        <th style="width: 15%; text-align: right;">Birim Fiyat</th>
        <th style="width: 10%; text-align: center;">KDV Oranı</th>
        <th style="width: 15%; text-align: right;">Toplam Tutar</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <table class="totals-table">
    <tr>
      <td class="label">Ara Toplam (Matrah):</td>
      <td style="text-align: right; font-family: monospace;">${money(totals.subtotal)}</td>
    </tr>
    <tr>
      <td class="label">Hesaplanan KDV (%20):</td>
      <td style="text-align: right; font-family: monospace;">${money(totals.totalVat)}</td>
    </tr>
    ${
      totals.totalWithholding > 0
        ? `<tr>
      <td class="label" style="color: #b91c1c;">Tevkifat Tutarı (9/10):</td>
      <td style="text-align: right; font-family: monospace; color: #b91c1c;">-${money(totals.totalWithholding)}</td>
    </tr>`
        : ''
    }
    <tr class="grand-total">
      <td class="label">ÖDENECEK GENEL TOPLAM:</td>
      <td style="text-align: right; font-family: monospace; color: #047857;">${money(totals.grandTotal)}</td>
    </tr>
  </table>

  <div class="footer">
    ${
      isFiledWithGib(invoice)
        ? `İşbu fatura 213 sayılı Vergi Usul Kanunu ve Gelir İdaresi Başkanlığı e-Fatura mevzuatına uygun olarak elektronik ortamda düzenlenmiş ve GİB'e iletilmiştir. Zarf No: ${invoice.gibEnvelopeId}`
        : UNFILED_NOTICE
    }
  </div>
</body>
</html>`;
}

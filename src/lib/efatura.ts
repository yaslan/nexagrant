/**
 * GİB (Gelir İdaresi Başkanlığı) E-Fatura & E-Arşiv Motoru
 * UBL-TR 1.2.1 XML Standartları, VKN/TCKN Algoritmik Doğrulaması, KDV & Tevkifat Hesaplamaları
 */

import {
  currencyExponent,
  formatMoney,
  toDecimalString,
  vatOnNetMinor,
  withholdingOnVatMinor,
} from './money';

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
  /**
   * Unit price in the invoice currency's minor unit (kuruş, cent), as an
   * integer — the shape the stored row already has (`unitPriceMinor` on
   * `invoiceLineSchema`) and the only shape CLAUDE.md rule 9 allows.
   *
   * It was a major-unit float until TASK-MTTUSEJFOSPI, which meant the caller
   * converted every stored integer out of minor units on the way in and the XML
   * generator then rounded the float back with `toFixed(2)` — a second rounding
   * rule, disagreeing with `vatOnNetMinor` by a kuruş at 1%, 10% and 18%.
   */
  unitPriceMinor: number;
  vatRate: number; // 20 for 20%
  withholdingCode?: string; // e.g. '604' (Danışmanlık 9/10)
  withholdingRate?: number; // 0.9 for 9/10
}

export interface InvoiceExchangeRate {
  sourceCurrency: 'TRY' | 'EUR' | 'USD';
  targetCurrency: 'TRY';
  calculationRate: number;
  date?: string;
  /**
   * The lira equivalent of the payable grand total, in minor units, exactly as
   * it was recorded on the invoice row (`Invoice.grandTotalTryMinor`).
   *
   * Optional because it is *read*, never derived: a document handed a rate but
   * no recorded total prints the rate alone rather than multiplying one out.
   * The figure on a fiscal document has to be the figure it was issued with,
   * and a second, independently rounded copy of it would be a second claim
   * about one sale (ADR-0002, KARAR §3).
   */
  tryEquivalentMinor?: number;
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
  exchangeRate?: InvoiceExchangeRate;
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
 * The same totals in the currency's minor unit — the shape everything that does
 * arithmetic on them should take (CLAUDE.md rule 9).
 */
export interface TaxTotalsMinor {
  subtotalMinor: number;
  totalVatMinor: number;
  totalWithholdingMinor: number;
  /** VAT actually payable: charged VAT less any withholding. */
  payableVatMinor: number;
  grandTotalMinor: number;
  /**
   * What each line contributed, in document order — the figures the XML line
   * block prints.
   *
   * They are carried out of here rather than recomputed by the generator so
   * that the sum of the printed `LineExtensionAmount`s *is* the printed
   * `LegalMonetaryTotal`, and the sum of the printed line `TaxAmount`s *is* the
   * printed document `TaxTotal`, by construction rather than by two
   * computations happening to agree. They did not agree: the generator used to
   * round the line with `toFixed(2)` on a float while the totals came from
   * `vatOnNetMinor` (TASK-MTTUSEJFOSPI).
   */
  lines: InvoiceLineTotalsMinor[];
}

/** One line's contribution to the document totals, in minor units. */
export interface InvoiceLineTotalsMinor {
  /** Quantity times unit price — the line's VAT-exclusive amount. */
  netMinor: number;
  /** VAT charged on that net, at the line's own rate. */
  vatMinor: number;
  /** The part of that VAT withheld (tevkifat); 0 when the line carries none. */
  withholdingMinor: number;
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
 * issue date (VUK 280). If an exchangeRate record is attached to the document,
 * the filing block is cleared (null). Otherwise, filing is refused.
 */
export function foreignCurrencyFilingBlock(invoice: EfaturaDocument): string | null {
  if (invoice.currency === 'TRY') return null;
  if (invoice.exchangeRate && typeof invoice.exchangeRate.calculationRate === 'number' && invoice.exchangeRate.calculationRate > 0) {
    return null;
  }
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
 * The single arithmetic behind every figure on the document: the totals block,
 * the per-line block of the XML, and the printed page all read this result.
 *
 * It no longer takes a currency. It used to, because it received a major-unit
 * float and had to know how many decimals to round it back to; now the prices
 * arrive as minor units of the invoice's own currency and the arithmetic is
 * integer throughout, so there is nothing left for an exponent to decide.
 */
export function invoiceTotalsMinor(lines: InvoiceLineItem[]): TaxTotalsMinor {
  let subtotalMinor = 0;
  let totalVatMinor = 0;
  let totalWithholdingMinor = 0;

  const lineTotals: InvoiceLineTotalsMinor[] = lines.map((line) => {
    // Integers all the way: `unitPriceMinor` is already in the currency's minor
    // unit, so this rounds only when `quantity` is fractional — which
    // `invoiceLineSchema` permits (half a month, a quarter day). Written the
    // same way `totalsForLines` in src/lib/billing/invoice-list.ts writes it,
    // on the same stored line, so the document and the panel state the same net.
    const netMinor = Math.round(line.quantity * line.unitPriceMinor);
    // The one rounding rule for tax in this codebase (`vatOnNetMinor`), not a
    // local `Math.round`: this document and the billing panel quote the same
    // sale, and a rule copied into each of them agrees only by coincidence.
    const vatMinor = vatOnNetMinor(netMinor, line.vatRate);
    // Same argument one step further down, and the same shared rule
    // (`withholdingOnVatMinor`): the withholding on this line is the figure the
    // billing panel prints for the same sale, so the two read one function
    // rather than each keeping its own `Math.round`.
    const withholdingMinor = line.withholdingRate
      ? withholdingOnVatMinor(vatMinor, line.withholdingRate)
      : 0;

    subtotalMinor += netMinor;
    totalVatMinor += vatMinor;
    totalWithholdingMinor += withholdingMinor;

    return { netMinor, vatMinor, withholdingMinor };
  });

  const payableVatMinor = totalVatMinor - totalWithholdingMinor;

  return {
    subtotalMinor,
    totalVatMinor,
    totalWithholdingMinor,
    payableVatMinor,
    grandTotalMinor: subtotalMinor + payableVatMinor,
    lines: lineTotals,
  };
}

/**
 * The same totals as major-unit numbers, for the readers that still want them.
 *
 * A view over `invoiceTotalsMinor`, not a second computation: every figure
 * here is that function's integer divided by the currency's major unit, so
 * there is one arithmetic and one rounding path behind both shapes.
 *
 * The float is the part CLAUDE.md rule 9 does not want, and it survives because
 * `tests/vat-by-country.test.ts` reads `document.totalVat` as a major-unit
 * number (`Math.round(document.totalVat * 100)`); the printed document reads
 * these fields for display only. New callers should take `invoiceTotalsMinor`.
 */
export function calculateInvoiceTotals(
  lines: InvoiceLineItem[],
  currency: InvoiceCurrency = 'TRY'
): TaxCalculationResult {
  const totals = invoiceTotalsMinor(lines);
  const majorUnit = 10 ** currencyExponent(currency);

  return {
    subtotal: totals.subtotalMinor / majorUnit,
    totalVat: totals.totalVatMinor / majorUnit,
    totalWithholding: totals.totalWithholdingMinor / majorUnit,
    payableVat: totals.payableVatMinor / majorUnit,
    grandTotal: totals.grandTotalMinor / majorUnit,
  };
}

/**
 * Renders a minor-unit amount in the invoice's own currency, in the Turkish
 * number format the printed document uses.
 *
 * The lira sign used to be hard-coded into every money cell while the box two
 * rows above said "Para Birimi: USD": a $99.00 subscription printed as a lira
 * amount, so the document contradicted itself about what was owed and
 * understated it by whatever the day's rate was (TASK-MTSWLWDONWA3W). The
 * symbol now comes from the same field as that box.
 */
export function formatInvoiceAmount(amountMinor: number, currency: InvoiceCurrency): string {
  // `formatMoney` is money.ts's display side and already pins the fraction
  // digits to the currency's exponent; keeping a second `Intl` call here was
  // one more place a money format could drift from the rest of the product.
  return formatMoney(amountMinor, currency, 'tr-TR');
}

/**
 * Resmî GİB UBL-TR 1.2.1 Standart XML Çıktısı Üretici
 */
/**
 * The one sentence that states the rate and the lira equivalent, or null.
 *
 * VUK 215 requires the lira equivalent to be shown *on the invoice*, and 385
 * Sıra No.lu Genel Tebliğ makes it mandatory for a domestic sale. Storing it in
 * a column satisfies neither: the buyer receives the rendered document and an
 * inspector opens the XML. So both generators print this same sentence rather
 * than each phrasing the figures their own way (TASK-MTSWLWDONWA3W, F-4).
 *
 * The bulletin date is part of the statement because a rate without its day is
 * not checkable, and the day used may precede the issue date across a weekend
 * (see `src/lib/fx/tcmb.ts`).
 */
export function exchangeRateStatement(
  invoice: EfaturaDocument,
  options: { includeTotal?: boolean } = {}
): string | null {
  const fx = invoice.exchangeRate;
  if (!fx || invoice.currency === 'TRY') return null;
  if (!Number.isFinite(fx.calculationRate) || fx.calculationRate <= 0) return null;

  const rate = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(fx.calculationRate);

  const day = fx.date ? ` (${fx.date})` : '';
  const head = `TCMB döviz alış kuru${day}: 1 ${fx.sourceCurrency} = ${rate} TRY`;

  // The printed document states the total on its own totals row, so it asks
  // for the rate alone and the figure is not repeated two lines apart.
  if (options.includeTotal === false) return head;
  if (typeof fx.tryEquivalentMinor !== 'number' || !Number.isFinite(fx.tryEquivalentMinor)) {
    return head;
  }
  const tl = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fx.tryEquivalentMinor / 100);
  return `${head} — ödenecek genel toplamın TL karşılığı: ${tl} TRY`;
}

export function generateUblTrXml(invoice: EfaturaDocument): string {
  // One computation for the whole document. Every amount printed below — the
  // line block, the tax block and the monetary totals — is a figure out of this
  // result, so the document adds up by construction. The line block used to do
  // its own float arithmetic and round it with `toFixed(2)`, which is a second
  // rounding rule and disagreed with `vatOnNetMinor` by a kuruş at 1%, 10% and
  // 18% VAT — on a document filed with GİB (TASK-MTTUSEJFOSPI, CLAUDE.md #9).
  const totals = invoiceTotalsMinor(invoice.lines);
  const amount = (minor: number) => toDecimalString(minor, invoice.currency);
  // A VAT rate is a percentage, not money: two decimals so 25.5% survives, and
  // never `formatMoney`.
  const percent = (rate: number) => rate.toFixed(2);

  const linesXml = invoice.lines
    .map((line, idx) => {
      const lineTotals = totals.lines[idx]!;
      return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${invoice.currency}">${amount(lineTotals.netMinor)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${invoice.currency}">${amount(lineTotals.vatMinor)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${invoice.currency}">${amount(lineTotals.netMinor)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${invoice.currency}">${amount(lineTotals.vatMinor)}</cbc:TaxAmount>
          <cbc:Percent>${percent(line.vatRate)}</cbc:Percent>
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
        <cbc:PriceAmount currencyID="${invoice.currency}">${amount(line.unitPriceMinor)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join('');

  // One `cac:TaxSubtotal` per VAT rate actually charged, in the order the rates
  // first appear, each summed from the same per-line figures the block above
  // printed. The document used to declare a single subtotal at a hard-coded
  // `20.00` percent, which was a false statement on every invoice that is not
  // all-20% — a zero-rated (Kuveyt) sale claimed 20% VAT of 0.00 (CLAUDE.md #7:
  // no figure on the document that is not computed from the sale).
  const byRate = new Map<number, { taxableMinor: number; taxMinor: number }>();
  invoice.lines.forEach((line, idx) => {
    const lineTotals = totals.lines[idx]!;
    const bucket = byRate.get(line.vatRate) ?? { taxableMinor: 0, taxMinor: 0 };
    bucket.taxableMinor += lineTotals.netMinor;
    bucket.taxMinor += lineTotals.vatMinor;
    byRate.set(line.vatRate, bucket);
  });

  const taxSubtotalsXml = [...byRate.entries()]
    .map(
      ([rate, bucket]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${invoice.currency}">${amount(bucket.taxableMinor)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${invoice.currency}">${amount(bucket.taxMinor)}</cbc:TaxAmount>
      <cbc:Percent>${percent(rate)}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
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
  }${
    // The rate blocks below carry the rate; a reader still has to be told the
    // lira figure the invoice was issued with rather than multiplying it out.
    // `cbc:Note` is repeatable in UBL-TR, which is why the figure goes here and
    // not into an element the schema does not define for it.
    exchangeRateStatement(invoice)
      ? `
  <cbc:Note>${exchangeRateStatement(invoice)}</cbc:Note>`
      : ''
  }
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>${
    invoice.exchangeRate
      ? `
  <cac:PricingExchangeRate>
    <cbc:SourceCurrencyCode>${invoice.exchangeRate.sourceCurrency}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>${invoice.exchangeRate.targetCurrency}</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${invoice.exchangeRate.calculationRate.toFixed(4)}</cbc:CalculationRate>${
          invoice.exchangeRate.date ? `\n    <cbc:Date>${invoice.exchangeRate.date}</cbc:Date>` : ''
        }
  </cac:PricingExchangeRate>
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${invoice.exchangeRate.sourceCurrency}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>${invoice.exchangeRate.targetCurrency}</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${invoice.exchangeRate.calculationRate.toFixed(4)}</cbc:CalculationRate>${
          invoice.exchangeRate.date ? `\n    <cbc:Date>${invoice.exchangeRate.date}</cbc:Date>` : ''
        }
  </cac:TaxExchangeRate>`
      : ''
  }

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
    <cbc:TaxAmount currencyID="${invoice.currency}">${amount(totals.payableVatMinor)}</cbc:TaxAmount>${taxSubtotalsXml}
  </cac:TaxTotal>

  <!-- Parasal Toplamlar -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${amount(totals.subtotalMinor)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${amount(totals.subtotalMinor)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${amount(totals.subtotalMinor + totals.totalVatMinor)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${amount(totals.grandTotalMinor)}</cbc:PayableAmount>
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
  // The same minor-unit result the XML prints, not the major-unit float view:
  // the page and the filed document describe one sale and must not round it
  // two different ways (CLAUDE.md #9).
  const totals = invoiceTotalsMinor(invoice.lines);
  const money = (amountMinor: number) => formatInvoiceAmount(amountMinor, invoice.currency);

  // The rates this invoice actually charges, for the totals row. It read
  // "%20" no matter what the lines said, so a zero-rated or mixed-rate sale
  // labelled its own VAT wrongly on the page the buyer receives.
  const vatRateLabel = [...new Set(invoice.lines.map((l) => l.vatRate))]
    .map((rate) => `%${rate}`)
    .join(' + ');

  const linesHtml = invoice.lines
    .map(
      (l, idx) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${l.name}</strong></td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${l.quantity} Adet</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${money(l.unitPriceMinor)}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">%${l.vatRate}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: bold;">${money(totals.lines[idx]!.netMinor)}</td>
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
      <td style="text-align: right; font-family: monospace;">${money(totals.subtotalMinor)}</td>
    </tr>
    <tr>
      <td class="label">Hesaplanan KDV (${vatRateLabel}):</td>
      <td style="text-align: right; font-family: monospace;">${money(totals.totalVatMinor)}</td>
    </tr>
    ${
      totals.totalWithholdingMinor > 0
        ? `<tr>
      <td class="label" style="color: #b91c1c;">Tevkifat Tutarı (9/10):</td>
      <td style="text-align: right; font-family: monospace; color: #b91c1c;">-${money(totals.totalWithholdingMinor)}</td>
    </tr>`
        : ''
    }
    <tr class="grand-total">
      <td class="label">ÖDENECEK GENEL TOPLAM:</td>
      <td style="text-align: right; font-family: monospace; color: #047857;">${money(totals.grandTotalMinor)}</td>
    </tr>${
      // VUK 215: a foreign-currency invoice has to show its lira equivalent on
      // the document itself. The row below is the only place a ₺ may appear on
      // a document whose sale is in another currency — the amounts above stay
      // in the currency the header declares (F-1, TASK-MTSWLWDONWA3W).
      invoice.exchangeRate && invoice.currency !== 'TRY'
        ? `
    <tr>
      <td class="label">TL karşılığı${
        typeof invoice.exchangeRate.tryEquivalentMinor === 'number'
          ? ''
          : ' (kayıtlı tutar yok)'
      }:</td>
      <td style="text-align: right; font-family: monospace;">${
        typeof invoice.exchangeRate.tryEquivalentMinor === 'number'
          ? formatInvoiceAmount(invoice.exchangeRate.tryEquivalentMinor, 'TRY')
          : '—'
      }</td>
    </tr>
    <tr>
      <td class="label" style="font-weight: normal; color: #475569;" colspan="2">${exchangeRateStatement(invoice, { includeTotal: false })}</td>
    </tr>`
        : ''
    }
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

import {
  invoiceLinesSchema,
  type StoredInvoiceLine,
} from '@/app/api/billing/invoices/[id]/export/invoice-document';
import { lineNetMinor, vatOnNetMinor, withholdingOnVatMinor } from '@/lib/money';

/**
 * The invoice history the billing panel shows.
 *
 * The panel used to render two constants — `GIB202600000001` / `…014`, dated
 * 01.09.2026 and 01.08.2026, described as "Team Plan" (a plan id retired in
 * `RETIRED_PLAN_IDS`) for ₺32,220 and ₺10,740. Nothing issued them, the amounts
 * matched no catalogue price, and they carried GİB document numbers under a
 * column header that says "GİB fatura no" (TASK-MTRD91ZLKEQ3A).
 *
 * `model Invoice` now holds invoices that were actually issued, so the rows
 * come from there. Everything here is a pure function over a row, so the two
 * rules below are unit-testable without a database:
 *   - a number is shown only when it can be derived from the stored line items;
 *     an unreadable `lines` payload renders as "not measured", never as a total
 *     someone might reconcile against,
 *   - a document counts as filed with GİB only when the row carries the
 *     envelope id GİB returned (same test as `isFiledWithGib`).
 */

/** The subset of an `Invoice` row this list is built from. */
export interface InvoiceListRecord {
  id: string;
  number: string;
  issuedAt: Date;
  currency: string;
  buyerName: string;
  buyerVknTckn: string;
  buyerTaxOffice: string;
  lines: unknown;
  gibEnvelopeId: string | null;
}

/**
 * One row as the panel renders it. Amounts are minor units (CLAUDE.md rule 9)
 * and are formatted in the client, in the viewer's locale.
 *
 * `amounts` is `null` when the stored lines could not be read: the row still
 * appears — the invoice exists and hiding it would be its own lie — but it
 * quotes no total.
 */
export interface InvoiceListRow {
  id: string;
  number: string;
  /** ISO-8601 UTC, formatted for display by the client. */
  issuedAt: string;
  currency: string;
  /** The line item names, as issued. Empty when the lines are unreadable. */
  description: string;
  amounts: InvoiceAmounts | null;
  /** True only when GİB returned an envelope id for this document. */
  filedWithGib: boolean;
}

export interface InvoiceAmounts {
  subtotalMinor: number;
  vatMinor: number;
  withholdingMinor: number;
  /** VAT actually payable: charged VAT less any withholding. */
  payableVatMinor: number;
  totalMinor: number;
}

/** The buyer identity as it was frozen onto the most recent invoice. */
export interface InvoiceBuyerIdentity {
  name: string;
  vknTckn: string;
  taxOffice: string;
}

/**
 * Totals for one set of stored lines, in minor units.
 *
 * Same arithmetic as `calculateInvoiceTotals` in src/lib/efatura.ts — subtotal,
 * VAT per line, withholding as a fraction of that line's VAT — and all three
 * steps are literally the same functions the document uses (`lineNetMinor`,
 * `vatOnNetMinor`, `withholdingOnVatMinor`), not second copies of them, so the
 * list and the exported document cannot disagree by a rounding step. The net
 * step was the last one still spelled out here as its own `Math.round`
 * (TASK-MTU27KSLSJZ9I).
 *
 * Every caller reaches this through `invoiceLinesSchema`, which already bounds
 * `quantity` to a positive number, `vatRate` to 0-100, `withholdingRate` to 0-1
 * and `unitPriceMinor` to a non-negative integer; that is why the guards inside
 * `lineNetMinor`, `vatOnNetMinor` and `withholdingOnVatMinor` cannot fire here
 * and an unreadable payload renders as no total (`amounts: null`) rather than a
 * thrown page.
 */
export function totalsForLines(lines: StoredInvoiceLine[]): InvoiceAmounts {
  let subtotalMinor = 0;
  let vatMinor = 0;
  let withholdingMinor = 0;

  for (const line of lines) {
    const lineMinor = lineNetMinor(line.quantity, line.unitPriceMinor);
    const lineVatMinor = vatOnNetMinor(lineMinor, line.vatRate);
    subtotalMinor += lineMinor;
    vatMinor += lineVatMinor;
    if (line.withholdingRate) {
      withholdingMinor += withholdingOnVatMinor(lineVatMinor, line.withholdingRate);
    }
  }

  const payableVatMinor = vatMinor - withholdingMinor;
  return {
    subtotalMinor,
    vatMinor,
    withholdingMinor,
    payableVatMinor,
    totalMinor: subtotalMinor + payableVatMinor,
  };
}

/** Turns one stored row into the row the panel renders. */
export function toInvoiceListRow(record: InvoiceListRecord): InvoiceListRow {
  const parsed = invoiceLinesSchema.safeParse(record.lines);

  return {
    id: record.id,
    number: record.number,
    issuedAt: record.issuedAt.toISOString(),
    currency: record.currency,
    description: parsed.success ? parsed.data.map((line) => line.name).join(', ') : '',
    amounts: parsed.success ? totalsForLines(parsed.data) : null,
    filedWithGib:
      typeof record.gibEnvelopeId === 'string' && record.gibEnvelopeId.trim().length > 0,
  };
}

/** Newest invoice first — the order the panel lists them in. */
export function buildInvoiceList(records: InvoiceListRecord[]): InvoiceListRow[] {
  return [...records]
    .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
    .map(toInvoiceListRow);
}

/**
 * Who the invoices were issued to, taken from the newest one.
 *
 * This is a snapshot the invoice carries, not a live lookup on the tenant: it
 * is what the customer's own document says. With no invoice on record there is
 * no answer, and the panel says so rather than printing a company name and a
 * VKN nobody registered — it shipped "Demo Ar-Ge ve Danışmanlık Ltd. Şti." and
 * VKN 2840958172 for exactly as long as the demo rows were there.
 */
export function latestBuyerIdentity(
  records: InvoiceListRecord[]
): InvoiceBuyerIdentity | null {
  const newest = [...records].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];
  if (!newest) return null;
  return {
    name: newest.buyerName,
    vknTckn: newest.buyerVknTckn,
    taxOffice: newest.buyerTaxOffice,
  };
}

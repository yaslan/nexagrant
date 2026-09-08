import { z } from 'zod';
import { toDecimalString } from '@/lib/money';
import type { EfaturaDocument, InvoiceLineItem, InvoiceParty } from '@/lib/efatura';

/**
 * Turning a stored `Invoice` row into the document the exporter renders.
 *
 * Everything here is a pure function over a row and the seller's configured
 * identity, so the rules below are unit-testable without a database:
 *   - nothing about a party is invented; a missing setting is an error, and the
 *     error names the setting,
 *   - amounts come out of the row as minor units and are converted once, here
 *     (CLAUDE.md rule 9),
 *   - the document is never marked as filed with GİB unless the row carries the
 *     envelope id GİB returned.
 *
 * The route this serves used to build the whole document from constants —
 * a fixed ETTN, a supplier VKN, a tax office, `isEfaturaUser: true` — and hand
 * it to anyone who asked (TASK-MTRD9QBJ2G32E).
 */

/** A stored invoice line. Unit price is minor units of the invoice's currency. */
export const invoiceLineSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  /** UN/ECE unit code — 'C62' (adet), 'MON' (ay). */
  unitCode: z.string().min(1).default('C62'),
  unitPriceMinor: z.number().int().nonnegative(),
  vatRate: z.number().min(0).max(100),
  withholdingCode: z.string().optional(),
  withholdingRate: z.number().min(0).max(1).optional(),
});

export const invoiceLinesSchema = z.array(invoiceLineSchema).min(1);

export type StoredInvoiceLine = z.infer<typeof invoiceLineSchema>;

/** The subset of an `Invoice` row the document is built from. */
export interface InvoiceRecord {
  number: string;
  issuedAt: Date;
  currency: string;
  buyerName: string;
  buyerVknTckn: string;
  buyerTaxOffice: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
  lines: unknown;
  profileId: string;
  invoiceType: string;
  ettn: string;
  gibEnvelopeId: string | null;
}

/**
 * The seller's fiscal identity, read from configuration rather than the
 * database: it describes Fabrika itself, is the same on every tenant's invoice,
 * and is not the application's to choose.
 */
export interface SupplierSettings {
  name?: string;
  vknTckn?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string;
}

/** Settings without which no invoice may be rendered, in the order reported. */
const REQUIRED_SUPPLIER_SETTINGS = [
  ['name', 'INVOICE_SUPPLIER_NAME'],
  ['vknTckn', 'INVOICE_SUPPLIER_VKN'],
  ['taxOffice', 'INVOICE_SUPPLIER_TAX_OFFICE'],
  ['address', 'INVOICE_SUPPLIER_ADDRESS'],
  ['city', 'INVOICE_SUPPLIER_CITY'],
] as const;

export class SupplierNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super(`Invoice supplier identity is not configured: ${missing.join(', ')}`);
    this.name = 'SupplierNotConfiguredError';
  }
}

export class InvoiceLinesInvalidError extends Error {
  constructor(readonly detail: string) {
    super(`Stored invoice lines are unreadable: ${detail}`);
    this.name = 'InvoiceLinesInvalidError';
  }
}

/**
 * Resolves the seller party, or throws naming every setting that is blank.
 * A blank string counts as unset — a half-filled `.env` must not become a
 * half-filled invoice.
 */
export function resolveSupplier(settings: SupplierSettings): InvoiceParty {
  const missing = REQUIRED_SUPPLIER_SETTINGS.filter(
    ([key]) => !settings[key]?.trim()
  ).map(([, variable]) => variable);

  if (missing.length > 0) throw new SupplierNotConfiguredError(missing);

  return {
    name: settings.name!.trim(),
    vknTckn: settings.vknTckn!.trim(),
    taxOffice: settings.taxOffice!.trim(),
    address: settings.address!.trim(),
    city: settings.city!.trim(),
    country: settings.country?.trim() || 'Türkiye',
    ...(settings.email?.trim() ? { email: settings.email.trim() } : {}),
    // Whether Fabrika is a registered e-invoice taxpayer is a fact about its
    // GİB registration, not a flag this code may assert. It is left unset until
    // something actually checks the register.
  };
}

const PROFILE_IDS = ['TICARIFATURA', 'TEMELFATURA', 'EARSIVFATURA'] as const;
const INVOICE_TYPES = ['SATIS', 'ISTISNA', 'TEVKIFAT'] as const;
const CURRENCIES = ['TRY', 'EUR', 'USD'] as const;

function narrow<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Builds the export document from one stored row.
 *
 * @throws SupplierNotConfiguredError when the seller identity is not set
 * @throws InvoiceLinesInvalidError when the row's `lines` are not readable
 */
export function buildInvoiceDocument(
  record: InvoiceRecord,
  supplier: SupplierSettings
): EfaturaDocument {
  const supplierParty = resolveSupplier(supplier);

  const parsed = invoiceLinesSchema.safeParse(record.lines);
  if (!parsed.success) {
    throw new InvoiceLinesInvalidError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    );
  }

  const currency = narrow(record.currency, CURRENCIES, 'TRY');
  const issued = record.issuedAt.toISOString();

  const lines: InvoiceLineItem[] = parsed.data.map((line, idx) => ({
    id: String(idx + 1),
    name: line.name,
    quantity: line.quantity,
    unitCode: line.unitCode,
    // The row holds minor units; the document renders major ones. One
    // conversion, in one place, through the shared money helper.
    unitPrice: Number(toDecimalString(line.unitPriceMinor, currency)),
    vatRate: line.vatRate,
    ...(line.withholdingCode ? { withholdingCode: line.withholdingCode } : {}),
    ...(line.withholdingRate ? { withholdingRate: line.withholdingRate } : {}),
  }));

  return {
    id: record.number,
    uuid: record.ettn,
    issueDate: issued.slice(0, 10),
    issueTime: issued.slice(11, 19),
    profileId: narrow(record.profileId, PROFILE_IDS, 'TICARIFATURA'),
    invoiceType: narrow(record.invoiceType, INVOICE_TYPES, 'SATIS'),
    currency,
    supplier: supplierParty,
    customer: {
      name: record.buyerName,
      vknTckn: record.buyerVknTckn,
      taxOffice: record.buyerTaxOffice,
      address: record.buyerAddress,
      city: record.buyerCity,
      country: record.buyerCountry,
    },
    lines,
    // Only what GİB actually returned. NULL stays absent, and the generators
    // then stamp the document as carrying no fiscal value.
    ...(record.gibEnvelopeId ? { gibEnvelopeId: record.gibEnvelopeId } : {}),
  };
}

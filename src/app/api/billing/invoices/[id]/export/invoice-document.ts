import { z } from 'zod';
import type { EfaturaDocument, InvoiceLineItem, InvoiceParty } from '@/lib/efatura';

/**
 * Turning a stored `Invoice` row into the document the exporter renders.
 *
 * Everything here is a pure function over a row and the seller's configured
 * identity, so the rules below are unit-testable without a database:
 *   - nothing about a party is invented; a missing setting is an error, and the
 *     error names the setting,
 *   - amounts stay in the minor units the row stores them in; nothing here
 *     converts money to a float (CLAUDE.md rule 9),
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
  /**
   * The FX evidence as it sits on the row (`Invoice.fxRate` and friends,
   * ADR-0002). `fxRate` is a Postgres NUMERIC, which Prisma hands back as a
   * Decimal object rather than a number; the structural `toNumber()` below
   * accepts that without this module having to import the Prisma runtime.
   */
  fxRate?: number | string | { toNumber(): number } | null;
  fxRateDate?: Date | null;
  fxRateSource?: string | null;
  grandTotalTryMinor?: number | null;
  /**
   * A pre-assembled rate, which takes precedence over the columns above.
   * Callers that already hold a document-shaped rate (tests, and any future
   * path that reconstructs one) use this; the export route passes the columns.
   */
  exchangeRate?: {
    sourceCurrency: 'TRY' | 'EUR' | 'USD';
    targetCurrency: 'TRY';
    calculationRate: number;
    date?: string;
    tryEquivalentMinor?: number;
  };
}

/** The row's `fxRate` as a plain number, or null when it is unusable. */
function fxRateAsNumber(value: InvoiceRecord['fxRate']): number | null {
  if (value === null || value === undefined) return null;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : value.toNumber();
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * The document's exchange-rate block, built from what the row actually stores.
 *
 * Returns undefined for a TRY invoice and for any row with no usable rate — and
 * `foreignCurrencyFilingBlock` then refuses to let that document be filed,
 * which is the intended outcome rather than an oversight. Nothing here invents
 * a rate or reaches for today's: the figure printed on a reissued document has
 * to be the figure it was issued at (ADR-0002, KARAR §3).
 */
export function exchangeRateFromRecord(
  record: InvoiceRecord,
  currency: 'TRY' | 'EUR' | 'USD'
): InvoiceRecord['exchangeRate'] {
  if (record.exchangeRate) return record.exchangeRate;
  if (currency === 'TRY') return undefined;

  const calculationRate = fxRateAsNumber(record.fxRate);
  if (calculationRate === null) return undefined;

  const date = record.fxRateDate ? record.fxRateDate.toISOString().slice(0, 10) : undefined;
  // The stored lira total travels with the rate, so the document can state the
  // figure it was issued with instead of recomputing one (VUK 215; F-4).
  const tryEquivalentMinor =
    typeof record.grandTotalTryMinor === 'number' && Number.isFinite(record.grandTotalTryMinor)
      ? record.grandTotalTryMinor
      : undefined;
  return {
    sourceCurrency: currency,
    targetCurrency: 'TRY',
    calculationRate,
    ...(date ? { date } : {}),
    ...(tryEquivalentMinor !== undefined ? { tryEquivalentMinor } : {}),
  };
}

/**
 * The seller's fiscal identity, read from configuration rather than the
 * database: it describes FonBridge itself, is the same on every tenant's invoice,
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
    // Whether FonBridge is a registered e-invoice taxpayer is a fact about its
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
    // Straight through: the row holds minor units and the document now carries
    // minor units too. This used to convert to a major-unit float here, which
    // the XML generator then rounded back with its own `toFixed(2)` — the same
    // sale rounded by two rules (TASK-MTTUSEJFOSPI, CLAUDE.md rule 9).
    unitPriceMinor: line.unitPriceMinor,
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
    ...(() => {
      const exchangeRate = exchangeRateFromRecord(record, currency);
      return exchangeRate ? { exchangeRate } : {};
    })(),
    // Only what GİB actually returned. NULL stays absent, and the generators
    // then stamp the document as carrying no fiscal value.
    ...(record.gibEnvelopeId ? { gibEnvelopeId: record.gibEnvelopeId } : {}),
  };
}

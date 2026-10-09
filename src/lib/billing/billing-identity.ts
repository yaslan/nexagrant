/**
 * The buyer's fiscal identity — validation and normalisation, with no I/O.
 *
 * `TenantBillingIdentity` is the row `invoice-writer.ts` reads before it issues
 * anything: without it a payment is taken and no invoice is written, which is
 * what `invoice_buyer_identity_missing` records. Until this module there was no
 * way to write that row at all — the table had a reader, a VAT resolver and an
 * alert, and no writer (TASK-MTSY71BUMBLWM).
 *
 * Everything here is pure so the rules can be unit tested without a database,
 * and so the server action and the form agree on one definition of "valid".
 *
 * ## Privacy (KVKK md.5-6 · docs/legal/processing-register.md §5)
 *
 * `buyerVknTckn` holds a TCKN for a sole trader — a national identity number,
 * which the processing register marks as requiring special measures. Nothing in
 * this module puts the value into an error, a log line or a return value: a
 * rejection names the *field and the rule*, never the number the user typed.
 * That is why the failures below are codes rather than sentences.
 */

import { z } from 'zod';
import { validateTCKN, validateVKN } from '@/lib/efatura';
import { findCountryVatRate, type CountryVatRate } from '@/lib/billing/vat-rates';

/** Longest value each free-text field accepts. Generous, but not unbounded. */
const MAX_NAME = 200;
const MAX_TAX_OFFICE = 120;
const MAX_ADDRESS = 400;
const MAX_CITY = 100;

/**
 * Collapses the whitespace a copy-paste out of a PDF brings with it. A tax
 * office pasted as "Maslak  Vergi\nDairesi" is the same tax office.
 */
export function normaliseText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Strips the punctuation people type into an identity number. VKNs are quoted
 * with spaces and dots on letterheads ("284 095 817 2"); the number is the
 * digits.
 */
export function normaliseVknTckn(raw: string): string {
  return raw.replace(/[\s.\-/]/g, '');
}

/** Machine-readable reasons a submission is refused. Mapped to text in the UI. */
export type BillingIdentityIssueCode =
  | 'required'
  | 'too_long'
  | 'vkn_tckn_not_digits'
  | 'vkn_tckn_length'
  | 'vkn_tckn_checksum'
  | 'country_unknown';

export interface BillingIdentityIssue {
  field: BillingIdentityField;
  code: BillingIdentityIssueCode;
}

export type BillingIdentityField =
  | 'buyerName'
  | 'buyerVknTckn'
  | 'buyerTaxOffice'
  | 'buyerAddress'
  | 'buyerCity'
  | 'buyerCountry';

/** The normalised row, exactly as it is written to `TenantBillingIdentity`. */
export interface BillingIdentityValues {
  buyerName: string;
  buyerVknTckn: string;
  buyerTaxOffice: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
}

export type BillingIdentityParse =
  | { ok: true; values: BillingIdentityValues; kind: 'vkn' | 'tckn' }
  | { ok: false; issues: BillingIdentityIssue[] };

/**
 * Shape check only. The field-level rules (length, checksum, known country)
 * run in {@link parseBillingIdentity}, so that one pass can report every
 * problem at once instead of stopping at the first — a form that rejects six
 * fields one refresh at a time is how a buyer gives up.
 */
export const BillingIdentityShape = z.object({
  buyerName: z.string(),
  buyerVknTckn: z.string(),
  buyerTaxOffice: z.string(),
  buyerAddress: z.string(),
  buyerCity: z.string(),
  buyerCountry: z.string(),
});

/** Fields that must carry a value, with the cap each one accepts. */
const TEXT_FIELDS: ReadonlyArray<{ field: BillingIdentityField; max: number }> = [
  { field: 'buyerName', max: MAX_NAME },
  { field: 'buyerTaxOffice', max: MAX_TAX_OFFICE },
  { field: 'buyerAddress', max: MAX_ADDRESS },
  { field: 'buyerCity', max: MAX_CITY },
];

/**
 * Validates a submitted identity and returns the row to store.
 *
 * The VKN/TCKN rule is not re-implemented here: `validateVKN` and
 * `validateTCKN` in `src/lib/efatura.ts` already carry the GİB check-digit
 * algorithms, and a second copy would be a second answer. Length picks which
 * one applies — 10 digits is a VKN, 11 a TCKN — because that is how the two are
 * told apart on a real document.
 */
export function parseBillingIdentity(input: unknown): BillingIdentityParse {
  const shape = BillingIdentityShape.safeParse(input);
  if (!shape.success) {
    // A non-string field never came from the form; report it as missing rather
    // than leaking the Zod path of a hand-crafted payload back to the caller.
    return {
      ok: false,
      issues: [{ field: 'buyerName', code: 'required' }],
    };
  }

  const issues: BillingIdentityIssue[] = [];
  const text: Record<string, string> = {};

  for (const { field, max } of TEXT_FIELDS) {
    const value = normaliseText(shape.data[field] as string);
    if (value.length === 0) {
      issues.push({ field, code: 'required' });
    } else if (value.length > max) {
      issues.push({ field, code: 'too_long' });
    }
    text[field] = value;
  }

  const digits = normaliseVknTckn(shape.data.buyerVknTckn);
  let kind: 'vkn' | 'tckn' = 'vkn';
  if (digits.length === 0) {
    issues.push({ field: 'buyerVknTckn', code: 'required' });
  } else if (!/^\d+$/.test(digits)) {
    issues.push({ field: 'buyerVknTckn', code: 'vkn_tckn_not_digits' });
  } else if (digits.length !== 10 && digits.length !== 11) {
    issues.push({ field: 'buyerVknTckn', code: 'vkn_tckn_length' });
  } else {
    kind = digits.length === 10 ? 'vkn' : 'tckn';
    const valid = kind === 'vkn' ? validateVKN(digits) : validateTCKN(digits);
    // The message says the number does not check out. It does not repeat the
    // number: an invalid TCKN is still a TCKN, and echoing it copies personal
    // data into a toast, a screenshot and a support ticket.
    if (!valid) issues.push({ field: 'buyerVknTckn', code: 'vkn_tckn_checksum' });
  }

  const country = normaliseText(shape.data.buyerCountry);
  let row: CountryVatRate | null = null;
  if (country.length === 0) {
    issues.push({ field: 'buyerCountry', code: 'required' });
  } else {
    row = findCountryVatRate(country);
    // A country the VAT table does not know cannot be invoiced
    // (`resolveVatRate` → `country_not_in_table`), so accepting it here would
    // store an identity that still produces no invoice — the exact failure this
    // screen exists to end.
    if (!row) issues.push({ field: 'buyerCountry', code: 'country_unknown' });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    kind,
    values: {
      buyerName: text.buyerName as string,
      buyerVknTckn: digits,
      buyerTaxOffice: text.buyerTaxOffice as string,
      buyerAddress: text.buyerAddress as string,
      buyerCity: text.buyerCity as string,
      // Stored as the table's canonical code rather than as typed, so
      // `resolveVatRate` never has to re-guess a spelling.
      buyerCountry: (row as CountryVatRate).country,
    },
  };
}

/**
 * How much of the identity number is safe to show back to the user.
 *
 * The stored value is not echoed in full anywhere in the UI. A buyer needs to
 * recognise which number is on file, not to read it off the screen, so only the
 * last four digits are rendered — the same principle the evidence pipeline
 * applies in `src/lib/evidence-ai.ts`.
 */
export function maskVknTckn(value: string): string {
  const digits = normaliseVknTckn(value);
  if (digits.length <= 4) return '•'.repeat(digits.length);
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Whether an invoice can actually be issued to this country today.
 *
 * A saved identity is not the same as an invoiceable one: the 27 EU rows in
 * `vat-rates.ts` carry `regime: 'unknown'` until a tax adviser rules, and the
 * writer refuses them. The form says so at save time rather than letting the
 * buyer discover it when no invoice arrives.
 */
export function countryIsInvoiceable(country: string): boolean {
  return findCountryVatRate(country)?.regime === 'standard';
}

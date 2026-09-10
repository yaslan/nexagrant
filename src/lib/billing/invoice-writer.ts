import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import {
  fetchTcmbBuyingRate,
  isConvertibleCurrency,
  type TcmbRateResult,
} from '@/lib/fx/tcmb';
import { convertCurrencyMinor, vatOnNetMinor } from '@/lib/money';
import { recordAlert } from '@/lib/observability/system-alert';

import { resolveVatRate } from './vat-rate';

/**
 * Issuing the `Invoice` row a successful payment earns.
 *
 * Before TASK-MTSWL8ADKZKDM nothing in production ever wrote one. `Invoice`
 * existed, the UBL-TR generator existed, the export route existed and the
 * e-Fatura preflight existed — but both payment paths (Stripe's
 * `logInvoicePayment` and iyzico's webhook sync) recorded a paid subscription
 * as an `AuditEvent` and stopped there. Every paying customer therefore had
 * zero invoices, `/api/billing/invoices/<id>/export` answered 404 for all of
 * them, and there would have been no document to file on the day integrator
 * credentials were entered.
 *
 * Both paths now call `createInvoiceForPayment`, and only this module writes
 * invoices, so the two providers cannot drift into issuing different documents
 * for the same sale.
 *
 * The rule this module is built around: an invoice states facts about a
 * taxpayer and a tax figure. Where a fact is not available it is not guessed —
 * the payment is left alone, no row is written, and a `SystemAlert` names what
 * is missing. A missing invoice is a visible, fixable gap; an invented VKN or
 * an invented VAT rate is a false fiscal document (TASK-MTRD9QBJ2G32E).
 *
 * The same rule now covers the exchange rate. ADR-0002 (decided 2026-09-08)
 * issues a foreign-currency invoice in its own currency and states the TCMB
 * buying rate of the issue date and the TL equivalent beside it (VUK 215/280/
 * 385). When TCMB cannot be read, this module issues nothing and raises a
 * SystemAlert — the boss's decision on the one question that ADR left open. It
 * never substitutes the last known rate: a rate is a fiscal assertion, and the
 * nearest available number is not the same assertion.
 *
 * Not in scope: filing. `gibEnvelopeId` stays NULL, so the exporter keeps
 * stamping the document "ÖRNEK BELGE — mali değeri yoktur". That is correct —
 * nothing has been sent to GİB.
 */

/** How the caller's payment is described to this module. */
export interface PaymentForInvoice {
  tenantId: string;
  /**
   * The provider's own payment/invoice id. Written to `Invoice.paymentRef`,
   * which is unique per tenant, so a redelivered webhook re-enters this
   * function and leaves with `already_issued` instead of a second document.
   */
  paymentRef: string;
  /** What the card was actually charged, in minor units (CLAUDE.md rule 9). */
  amountMinor: number;
  currency: string;
  /** What the customer bought, as it should read on the invoice line. */
  description: string;
  /** Payment time, UTC (CLAUDE.md rule 10). */
  paidAt: Date;
  /** For the alert trail only, never printed on the document. */
  provider: 'stripe' | 'iyzico';
}

/** The buyer's fiscal identity, as stored for the tenant. */
export interface BuyerIdentity {
  buyerName: string;
  buyerVknTckn: string;
  buyerTaxOffice: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
}

export type InvoiceWriteResult =
  | { status: 'issued'; id: string; number: string; ettn: string }
  | { status: 'already_issued'; number: string }
  | {
      status: 'skipped';
      reason:
        | 'buyer_identity_missing'
        /** No sourced VAT rate for the buyer's country (boss decision 2026-09-08). */
        | 'vat_country_unknown'
        | 'amount_not_invoiceable'
        | 'number_allocation_failed'
        /** TCMB could not be read, so the TL equivalent is unknown (ADR-0002). */
        | 'fx_rate_unavailable'
        /** Charged in a currency TCMB conversion is not defined for. */
        | 'fx_currency_unsupported';
      /** Field or setting names, so an operator knows what to fill in. */
      missing?: string[];
    };

/** The buyer fields an invoice cannot be issued without, in the order reported. */
const REQUIRED_BUYER_FIELDS = [
  'buyerName',
  'buyerVknTckn',
  'buyerTaxOffice',
  'buyerAddress',
  'buyerCity',
] as const;

/** The subset of a Prisma client this module touches. */
export type InvoiceWriterDb = Pick<Prisma.TransactionClient, 'invoice' | 'tenantBillingIdentity'>;

/**
 * How many times a number collision is retried before giving up.
 *
 * A collision means another payment for the same tenant committed between this
 * transaction reading the highest number and writing its own. Three attempts
 * covers a realistic burst; beyond that something else is wrong and inventing
 * more numbers will not help.
 */
const NUMBER_ATTEMPTS = 3;

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Re-exported so this module's existing importers keep their import site, but
 * the rule itself lives in `./vat-rate` — `scripts/efatura-preflight.ts` has to
 * apply the very same check without loading the Prisma client that this file
 * pulls in. See that module for why it is not duplicated here.
 *
 * `parseVatRate` stays exported for the preflight's "this setting is now
 * ignored" report; since 2026-09-08 nothing in this file reads it, because the
 * rate comes from the buyer's country (`resolveVatRate`).
 */
export { parseVatRate, resolveVatRate } from './vat-rate';

/**
 * A line as it is stored on the row; see `invoiceLineSchema` in the export route.
 *
 * A type alias rather than an interface on purpose: only an alias gets an
 * implicit index signature, which is what makes it assignable to Prisma's
 * `InputJsonValue` without a cast that would switch the type check off.
 */
export type DecomposedLine = {
  name: string;
  quantity: number;
  unitCode: string;
  unitPriceMinor: number;
  vatRate: number;
};

/**
 * Split a VAT-inclusive charge into the net price the row stores, the VAT that
 * will be recomputed from it, and the rounding remainder.
 *
 * The stored `unitPriceMinor` is the price *before* VAT — `calculateInvoiceTotals`
 * in src/lib/efatura.ts adds VAT back on top of it. The payment amount is the
 * gross the card was charged. Storing the gross as the unit price would print a
 * grand total of `gross × 1.20` on a document for a customer who paid `gross`,
 * so the gross is decomposed here.
 *
 * The complication, measured rather than assumed: `net + round(net × rate/100)`
 * does not hit every integer. At 20% it lands on only five of every six, so a
 * scheme that demanded an exact single-line split would have refused to invoice
 * about one payment in six (16.67% of amounts up to ₺2000.00; 15.25% at 18%,
 * 9.09% at 10%). Refusing that many real sales is not an acceptable answer.
 *
 * So the largest net that does not overshoot is taken, and whatever is left is
 * returned as `roundingMinor`. Across every amount up to 200 000 minor units at
 * 0/1/8/10/18/20% that remainder is never more than **one** minor unit, and
 * `net + vat + rounding` equals the charge exactly, always. The caller puts the
 * remainder on the document as its own zero-VAT "yuvarlama farkı" line, so the
 * invoice total always reconciles to the receipt and the difference is visible
 * rather than absorbed silently into a price.
 *
 * Returns null only for an amount that is not a positive whole minor unit.
 */
export function decomposeGrossAmount(
  grossMinor: number,
  vatRate: number
): { netMinor: number; vatMinor: number; roundingMinor: number } | null {
  if (!Number.isInteger(grossMinor) || grossMinor <= 0) return null;

  // Binary search for the largest net with net + round(net × rate/100) <= gross.
  // The function is monotonic in net, so bisection is exact and needs no guard
  // against the rounding step the way a divide-and-adjust would.
  let low = 1;
  let high = grossMinor;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (mid + vatOnNetMinor(mid, vatRate) <= grossMinor) low = mid;
    else high = mid - 1;
  }

  const netMinor = low;
  const vatMinor = vatOnNetMinor(netMinor, vatRate);
  return { netMinor, vatMinor, roundingMinor: grossMinor - netMinor - vatMinor };
}

/** `FB-<year>-<six digits>`, the form the customer cites. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `FB-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * The sequence number following the highest one already issued to this tenant
 * in this year, given that tenant's newest number for the year (or null).
 *
 * A number this function cannot parse is treated as "no usable predecessor" and
 * restarts the year at 1; the unique index is what actually prevents a
 * collision, and the retry loop above handles it.
 */
export function nextSequence(latestNumber: string | null, year: number): number {
  if (!latestNumber) return 1;
  const match = new RegExp(`^FB-${year}-(\\d{6})$`).exec(latestNumber);
  if (!match?.[1]) return 1;
  return Number(match[1]) + 1;
}

/**
 * The `profileId` an invoice is issued under, and why it is a placeholder.
 *
 * The correct value depends on whether the *buyer* is registered with GİB as an
 * e-Fatura taxpayer: `TICARIFATURA` if they are, `EARSIVFATURA` if they are not.
 * Answering that requires a query against the GİB register through a licensed
 * integrator, and FonBridge has no integrator contract yet — so today the answer
 * is genuinely unknown.
 *
 * `EARSIVFATURA` is written, and every invoice issued this way also raises a
 * SystemAlert saying the profile was assumed rather than resolved. This is safe
 * only because nothing is filed: `gibEnvelopeId` is NULL on every row, and the
 * exporter therefore stamps the document as carrying no fiscal value. Before
 * the first real filing, every row still carrying this value has to be
 * re-profiled against the register.
 */
export const ASSUMED_PROFILE_ID = 'EARSIVFATURA';

/**
 * The line carrying the sub-kuruş remainder of a VAT-inclusive charge.
 *
 * Named in Turkish because it is printed on the document, which is a Turkish
 * fiscal form; the rest of the line text comes from the plan the customer
 * bought. See `decomposeGrossAmount` for why it exists and how small it is.
 */
export const ROUNDING_LINE_NAME = 'Yuvarlama farkı';

/** The rate lookup this module depends on, narrowed so tests can stand in for it. */
export type FetchRate = (
  currency: 'USD' | 'EUR',
  issuedAt: Date
) => Promise<TcmbRateResult>;

/** The FX facts written onto a foreign-currency invoice row, or `null` for TRY. */
export interface InvoiceFxRecord {
  fxRate: number;
  fxRateDate: Date;
  fxRateSource: 'TCMB';
  grandTotalTryMinor: number;
}

/**
 * Establish the rate and TL equivalent for one charge, or say why it cannot be.
 *
 * TRY returns `null` — there is nothing to convert, and the row's FX columns
 * stay NULL, which is exactly what the database CHECK constraint
 * `Invoice_fx_required_for_foreign_currency` permits for TRY and forbids for
 * anything else. The constraint is the backstop; this function is the path.
 *
 * `grandTotalTryMinor` converts the **gross** charge, not the net line price:
 * the TL figure a Turkish invoice has to show is the payable total, the same
 * number the customer was charged.
 */
export async function resolveInvoiceFx(
  amountMinor: number,
  currency: string,
  issuedAt: Date,
  fetchRate: FetchRate
): Promise<
  | { ok: true; fx: InvoiceFxRecord | null }
  | { ok: false; reason: 'fx_currency_unsupported' | 'fx_rate_unavailable'; detail: string }
> {
  const code = currency.trim().toUpperCase();
  if (code === 'TRY') return { ok: true, fx: null };

  if (!isConvertibleCurrency(code)) {
    return {
      ok: false,
      reason: 'fx_currency_unsupported',
      detail: `TCMB conversion is not defined for ${code}; only TRY, USD and EUR are invoiceable.`,
    };
  }

  const result = await fetchRate(code, issuedAt);
  if (!result.ok) {
    return { ok: false, reason: 'fx_rate_unavailable', detail: `${result.failure.reason}: ${result.failure.detail}` };
  }

  let grandTotalTryMinor: number;
  try {
    grandTotalTryMinor = convertCurrencyMinor(amountMinor, result.rate.rate);
  } catch (error) {
    // convertCurrencyMinor refuses a non-integer amount, a non-positive rate and
    // a product outside the safe integer range. Any of those means the TL figure
    // cannot be stated exactly, and a fiscal document may not carry an
    // approximate one.
    return {
      ok: false,
      reason: 'fx_rate_unavailable',
      detail: `conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    ok: true,
    fx: {
      fxRate: result.rate.rate,
      // Stored as the bulletin's own day at UTC midnight; the column is DATE, so
      // no time part survives and no timezone can shift it (CLAUDE.md rule 10).
      fxRateDate: new Date(`${result.rate.rateDate}T00:00:00.000Z`),
      fxRateSource: result.rate.source,
      grandTotalTryMinor,
    },
  };
}

/**
 * Issue the invoice for one payment, or explain why none was issued.
 *
 * Never throws for a business reason and never rolls the caller's transaction
 * back: a payment that succeeded must stay recorded even when its invoice
 * cannot be written. The only exceptions that escape are genuine database
 * failures, which the caller already has to handle.
 *
 * @param db a client or an open transaction; the caller decides the boundary
 */
export async function createInvoiceForPayment(
  db: InvoiceWriterDb,
  payment: PaymentForInvoice,
  options: {
    /**
     * How the TCMB rate is obtained. Injected only by tests and by the
     * disproof probe that takes the client away to prove issuing stops;
     * production leaves it alone and gets `fetchTcmbBuyingRate`.
     */
    fetchRate?: FetchRate | undefined;
  } = {}
): Promise<InvoiceWriteResult> {
  const { tenantId, paymentRef, amountMinor, currency, description, paidAt, provider } = payment;

  // Already invoiced. Checked before anything else so a redelivered webhook is
  // cheap and silent — it is normal traffic, not a fault worth alerting on.
  const existing = await db.invoice.findFirst({
    where: { tenantId, paymentRef },
    select: { number: true },
  });
  if (existing) return { status: 'already_issued', number: existing.number };

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    // A zero or negative charge is not a sale. Refunds and credit notes are a
    // different document type (iade faturası) and are not modelled yet.
    await recordAlert({
      level: 'warn',
      source: 'invoice_not_issued',
      message: 'Payment is not an invoiceable amount; no invoice issued.',
      meta: { provider, currency },
    });
    return { status: 'skipped', reason: 'amount_not_invoiceable' };
  }

  // The buyer's identity is read before the tax rate, and that order is the
  // change: since 2026-09-08 the rate is a fact about *this buyer's country*,
  // so there is nothing to resolve until we know who bought.
  const identity = await db.tenantBillingIdentity.findUnique({
    where: { tenantId },
    select: {
      buyerName: true,
      buyerVknTckn: true,
      buyerTaxOffice: true,
      buyerAddress: true,
      buyerCity: true,
      buyerCountry: true,
    },
  });

  // A blank string counts as unset: a half-filled identity must not become a
  // half-filled invoice, the same rule `resolveSupplier` applies to the seller.
  const missing = identity
    ? REQUIRED_BUYER_FIELDS.filter((field) => !identity[field]?.trim())
    : [...REQUIRED_BUYER_FIELDS];

  if (!identity || missing.length > 0) {
    // Deliberately names the fields and not their values: the alert trail must
    // not become a second copy of a customer's tax identity.
    await recordAlert({
      level: 'error',
      source: 'invoice_buyer_identity_missing',
      message: `A payment was taken but no invoice could be issued: the tenant's billing identity is incomplete (${missing.join(', ')}).`,
      meta: { provider, tenantId, missing },
    });
    return { status: 'skipped', reason: 'buyer_identity_missing', missing: [...missing] };
  }

  // VAT by the buyer's country (boss decision, 2026-09-08). Read from the
  // fiscal identity and never from `Tenant.country`, which is an unverified
  // self-declaration: a buyer able to pick their own country would be a buyer
  // able to pick their own tax.
  const vat = resolveVatRate(identity.buyerCountry);
  if (vat.status !== 'resolved') {
    // Two different gaps with two different fixes, so they are not described in
    // one sentence: an absent country needs a sourced row, while a country whose
    // regime is undecided needs a tax adviser's ruling. Telling an operator to
    // "add the country" when it is already there would send them in circles.
    const message =
      vat.status === 'regime_not_chargeable'
        ? `A payment was taken but no invoice could be issued: the buyer's country is in the VAT table, but how the sale is treated has not been decided. ` +
          `A Türkiye-resident supplier does not normally charge EU VAT — B2B supplies are usually the customer's own liability under the reverse charge, ` +
          `and B2C digital services run through an OSS registration. Set the country's regime in src/lib/billing/vat-rates.ts once a tax adviser has ruled. Payments are unaffected.`
        : `A payment was taken but no invoice could be issued: there is no sourced VAT rate for the buyer's country. ` +
          `A rate is a legal fact about a country, so it is looked up rather than assumed — guessing 20% would overcharge a buyer ` +
          `in a country with no VAT, and guessing 0% would leave a collected tax unaccounted for. ` +
          `Add the country to src/lib/billing/vat-rates.ts with its source, and the payment can be invoiced. Payments are unaffected.`;

    await recordAlert({
      level: 'error',
      source: 'invoice_vat_country_unknown',
      message,
      // Names the country and the table, never the buyer or the amount.
      meta: {
        provider,
        tenantId,
        reason: vat.status,
        country: vat.status === 'country_missing' ? null : vat.country,
        regime: vat.status === 'regime_not_chargeable' ? vat.regime : null,
        detail: vat.detail,
      },
    });
    return { status: 'skipped', reason: 'vat_country_unknown' };
  }
  const vatRate = vat.ratePercent;

  // Defensive only: the amount was already established to be a positive whole
  // minor unit above, which is the sole condition under which this returns null.
  // Reaching it would mean the two checks had drifted apart, so it refuses to
  // issue rather than carrying on with a total it cannot account for.
  const decomposed = decomposeGrossAmount(amountMinor, vatRate);
  if (!decomposed) {
    await recordAlert({
      level: 'error',
      source: 'invoice_not_issued',
      message:
        'The charged amount passed the invoiceable-amount check but could not be split into a net price and VAT, so no invoice was issued.',
      meta: { provider, currency, vatRate },
    });
    return { status: 'skipped', reason: 'amount_not_invoiceable' };
  }

  const lines: DecomposedLine[] = [
    {
      name: description,
      quantity: 1,
      // UN/ECE 'MON' is a month; a subscription period is billed as one of them.
      unitCode: 'MON',
      unitPriceMinor: decomposed.netMinor,
      vatRate,
    },
  ];

  // At most one minor unit, and only when the rate cannot divide the charge
  // exactly. Carried at 0% VAT so it changes the total and not the tax figure.
  if (decomposed.roundingMinor > 0) {
    lines.push({
      name: ROUNDING_LINE_NAME,
      quantity: 1,
      unitCode: 'C62',
      unitPriceMinor: decomposed.roundingMinor,
      vatRate: 0,
    });
  }

  // The rate is fetched *before* a number is allocated, so a TCMB outage never
  // burns an invoice number on a document that is not written.
  const fxResult = await resolveInvoiceFx(
    amountMinor,
    currency,
    paidAt,
    options.fetchRate ?? fetchTcmbBuyingRate
  );
  if (!fxResult.ok) {
    await recordAlert({
      level: 'error',
      source: 'invoice_not_issued',
      message:
        fxResult.reason === 'fx_rate_unavailable'
          ? `A payment was taken in ${currency} but the TCMB buying rate for its issue date could not be established, so no invoice was issued. A foreign-currency invoice without the rate and the TL equivalent is not a valid document (VUK 215/280/385, ADR-0002); the last known rate is deliberately not substituted. The payment is unaffected — reissue once TCMB is reachable.`
          : `A payment was taken in ${currency}, which no invoice can be denominated in: the TL equivalent required by VUK 215/385 cannot be established for it. No invoice was issued and the payment is unaffected.`,
      // Names the currency and the failure, never the buyer or the amount.
      meta: { provider, currency, reason: fxResult.reason, detail: fxResult.detail },
    });
    return { status: 'skipped', reason: fxResult.reason };
  }
  const fx = fxResult.fx;

  const year = paidAt.getUTCFullYear();

  for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
    // Read the tenant's highest number for the year, take the next one, and let
    // the unique index arbitrate if another payment got there first. Ordering
    // by the string is safe because the sequence is zero-padded to a fixed width.
    const latest = await db.invoice.findFirst({
      where: { tenantId, number: { startsWith: `FB-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const number = formatInvoiceNumber(year, nextSequence(latest?.number ?? null, year));

    try {
      const created = await db.invoice.create({
        data: {
          tenantId,
          number,
          issuedAt: paidAt,
          currency,
          ...identity,
          lines,
          profileId: ASSUMED_PROFILE_ID,
          invoiceType: 'SATIS',
          ettn: randomUUID(),
          // Stays NULL: nothing has been filed with GİB, and the exporter
          // stamps the document accordingly.
          gibEnvelopeId: null,
          paymentRef,
          // NULL together on a TRY invoice, all four present on any other —
          // the shape `Invoice_fx_required_for_foreign_currency` enforces.
          fxRate: fx?.fxRate ?? null,
          fxRateDate: fx?.fxRateDate ?? null,
          fxRateSource: fx?.fxRateSource ?? null,
          grandTotalTryMinor: fx?.grandTotalTryMinor ?? null,
        },
        select: { id: true, number: true, ettn: true },
      });

      await recordAlert({
        level: 'warn',
        source: 'invoice_profile_assumed',
        message: `Invoices are being issued as ${ASSUMED_PROFILE_ID} without checking whether the buyer is a registered e-Fatura taxpayer; that check needs an integrator contract. Every such invoice must be re-profiled before it is filed with GİB.`,
        meta: { profileId: ASSUMED_PROFILE_ID },
      });

      return { status: 'issued', id: created.id, number: created.number, ettn: created.ettn };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Two payments raced. If the other one was for *this* payment (a
      // concurrent redelivery), we are done; otherwise take the next number.
      const raced = await db.invoice.findFirst({
        where: { tenantId, paymentRef },
        select: { number: true },
      });
      if (raced) return { status: 'already_issued', number: raced.number };
    }
  }

  await recordAlert({
    level: 'error',
    source: 'invoice_not_issued',
    message: `Could not allocate an invoice number after ${NUMBER_ATTEMPTS} attempts; the payment succeeded but no invoice was issued.`,
    meta: { provider, tenantId },
  });
  return { status: 'skipped', reason: 'number_allocation_failed' };
}

import { lineNetMinor } from '@/lib/money';

/**
 * NG-137 (M18-F2). The arithmetic of a consultancy quote (`ServiceQuote`): line nets, the
 * total, and the success fee. Everything is Int minor units (CLAUDE.md rule 9); line nets go
 * through `lineNetMinor`, the single line rule in `src/lib/money.ts`.
 *
 * The SUCCESS FEE (başarı primi) is the consultancy's own fee, charged to the client when a
 * grant is awarded. It is NOT an eligible cost in the grant budget (docs/BILLING.md) and
 * nothing here models it as one: it is never added to `totalCents`, and the breakdown carries
 * `successFeeIsEligibleCost: false` for the screen to show beside it.
 *
 * Rounding rules are new (decision K-581471): HibeLead's quote code is gone.
 */

export interface QuoteLineInput {
  label: string;
  quantity: number;
  unitCents: number;
}

export interface QuoteLine extends QuoteLineInput {
  netCents: number;
}

export interface QuoteTotals {
  lines: QuoteLine[];
  totalCents: number;
  currency: string;
}

function assertCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Currency must be an ISO 4217 code, got "${currency}"`);
  return code;
}

/** Line nets and the quote total (what `ServiceQuote.totalCents` stores). VAT is not added here. */
export function quoteTotals(lines: readonly QuoteLineInput[], currency: string): QuoteTotals {
  const code = assertCurrency(currency);
  const priced = lines.map((line) => ({ ...line, netCents: lineNetMinor(line.quantity, line.unitCents) }));
  const totalCents = priced.reduce((sum, line) => sum + line.netCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new Error('Quote total out of safe integer range');
  return { lines: priced, totalCents, currency: code };
}

export interface SuccessFeeTerms {
  /** Basis points of the awarded grant: 500 = 5 %. `ServicePackage.successFeeBp`. */
  successFeeBp: number;
  /** Ceiling, minor units. `ServicePackage.successFeeCapCents`; `null` = no ceiling. */
  successFeeCapCents: number | null;
  currency: string;
}

export interface SuccessFee {
  feeCents: number;
  /** True when the ceiling, not the percentage, set the fee. */
  capped: boolean;
  currency: string;
  successFeeIsEligibleCost: false;
}

/**
 * Success fee on an awarded grant: half-up on the exact integer product
 * `grant × bp / 10000`, then the ceiling. The grant and the terms must be in the same
 * currency — converting is a separate, dated decision (`convertCurrencyMinor`), not a
 * side effect of quoting.
 */
export function successFee(grantCents: number, grantCurrency: string, terms: SuccessFeeTerms): SuccessFee {
  const currency = assertCurrency(terms.currency);
  if (assertCurrency(grantCurrency) !== currency) {
    throw new Error(`Grant is in ${grantCurrency}, success fee terms in ${terms.currency}`);
  }
  if (!Number.isSafeInteger(grantCents) || grantCents < 0) {
    throw new Error(`Grant must be a non-negative integer of minor units, got ${grantCents}`);
  }
  if (!Number.isInteger(terms.successFeeBp) || terms.successFeeBp < 0 || terms.successFeeBp > 10_000) {
    throw new Error(`Success fee must be 0–10000 basis points, got ${terms.successFeeBp}`);
  }
  const cap = terms.successFeeCapCents;
  if (cap !== null && (!Number.isSafeInteger(cap) || cap < 0)) {
    throw new Error(`Success fee cap must be a non-negative integer of minor units, got ${cap}`);
  }
  const numerator = grantCents * terms.successFeeBp;
  if (!Number.isSafeInteger(numerator)) throw new Error('Success fee out of safe integer range');
  // Exact for integers: the remainder decides the half-up step, no float division involved.
  const whole = Math.floor(numerator / 10_000);
  const raw = numerator - whole * 10_000 >= 5_000 ? whole + 1 : whole;
  if (cap !== null && raw > cap) return { feeCents: cap, capped: true, currency, successFeeIsEligibleCost: false };
  return { feeCents: raw, capped: false, currency, successFeeIsEligibleCost: false };
}

/**
 * Money helpers — CLAUDE.md rule 9: every amount is an `Int` in the currency's
 * minor unit (kuruş, cent) plus a `currency` code. Nothing in the codebase may
 * carry a float amount; floats lose kuruş on the third arithmetic operation and
 * the loss shows up on an invoice.
 *
 * Payment providers speak decimal strings on the wire ("1850.00"). These two
 * functions are the only place that conversion is allowed to happen.
 */

/** Minor units per major unit, by ISO-4217 exponent. Default is 2. */
const CURRENCY_EXPONENT: Record<string, number> = {
  TRY: 2,
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

export interface MoneyAmount {
  /** Integer amount in the currency's minor unit. */
  amountMinor: number;
  /** ISO-4217 code, upper case. */
  currency: string;
}

/**
 * Parses a provider decimal string ("1850.00", "1850.5", "1850") into minor
 * units. Rejects anything that is not a plain decimal number — an unparsable
 * amount must never silently become 0, because 0 reads as "paid nothing" and
 * would still activate a subscription.
 */
export function toMinorUnits(decimal: string | number, currency: string): number {
  const text = typeof decimal === 'number' ? decimal.toString() : decimal.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(decimal)}`);
  }
  const [, sign, whole, fractionRaw = ''] = match;
  const exponent = currencyExponent(currency);

  // Round half-up on the first digit past the currency's exponent rather than
  // truncating, so "10.005" TRY becomes 1001 kuruş and not 1000.
  const padded = fractionRaw.padEnd(exponent + 1, '0');
  const kept = padded.slice(0, exponent);
  const nextDigit = Number(padded[exponent] ?? '0');

  let minor = Number(`${whole}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Amount out of safe integer range: ${text} ${currency}`);
  }
  if (sign === '-') minor = -minor;
  return minor;
}

/**
 * Renders minor units as the decimal string providers expect on the wire.
 * Integer arithmetic only — no division into a float.
 */
export function toDecimalString(amountMinor: number, currency: string): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Minor-unit amounts must be integers, got ${amountMinor}`);
  }
  const exponent = currencyExponent(currency);
  if (exponent === 0) return amountMinor.toString();

  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor).toString().padStart(exponent + 1, '0');
  const whole = abs.slice(0, abs.length - exponent);
  const fraction = abs.slice(abs.length - exponent);
  return `${sign}${whole}.${fraction}`;
}

/** True when two amounts are the same value in the same currency. */
export function sameAmount(a: MoneyAmount, b: MoneyAmount): boolean {
  return a.amountMinor === b.amountMinor && a.currency.toUpperCase() === b.currency.toUpperCase();
}

/**
 * Takes a whole-percent discount off a minor-unit amount, in integer
 * arithmetic, rounding half-up on the resulting cent.
 *
 * Kept here rather than in the billing catalogue because it is the arithmetic
 * every discounted price in the product goes through (CLAUDE.md rule 9), and
 * because `amountMinor * (100 - percentOff)` is exact for integer inputs where
 * `amountMinor * 0.3` is not.
 */
export function applyPercentDiscount(amountMinor: number, percentOff: number): number {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Minor-unit amounts must be integers, got ${amountMinor}`);
  }
  if (!Number.isInteger(percentOff) || percentOff < 0 || percentOff > 100) {
    throw new Error(`Discount must be a whole percent between 0 and 100, got ${percentOff}`);
  }
  if (amountMinor < 0) {
    throw new Error(`Cannot discount a negative amount: ${amountMinor}`);
  }
  const numerator = amountMinor * (100 - percentOff);
  if (!Number.isSafeInteger(numerator)) {
    throw new Error(`Amount out of safe integer range: ${amountMinor}`);
  }
  return Math.floor(numerator / 100 + 0.5);
}

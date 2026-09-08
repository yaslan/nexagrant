/**
 * The one rule that decides whether a VAT rate is configured.
 *
 * It lives in its own module, rather than beside its caller in
 * `invoice-writer.ts`, so that both users can reach it: the writer that
 * refuses to issue an invoice without it, and `scripts/efatura-preflight.ts`,
 * which is the go-live gate and must not pull the Prisma client and the alert
 * store in behind it just to check a percentage.
 *
 * Two copies of this rule would mean a preflight that goes green on a value
 * the writer then rejects — exactly the false green this module exists to
 * prevent (TASK-MTSYAKDK5LV9E).
 */

/**
 * The VAT rate an invoice is issued under, or null when it is not configured.
 *
 * `0` is a real answer and must survive: a sale genuinely outside VAT is not
 * the same as a rate nobody has set. Hence an explicit null rather than a
 * falsy check.
 */
export function parseVatRate(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

import {
  chargeableVatCountries,
  findCountryVatRate,
  type CountryVatRate,
  type VatRegime,
} from './vat-rates';

/**
 * The one rule that decides which VAT rate an invoice is issued under.
 *
 * It lives in its own module, rather than beside its caller in
 * `invoice-writer.ts`, so that both users can reach it: the writer that
 * refuses to issue an invoice without it, and `scripts/efatura-preflight.ts`,
 * which is the go-live gate and must not pull the Prisma client and the alert
 * store in behind it just to check a percentage.
 *
 * Two copies of this rule would mean a preflight that goes green on a rate the
 * writer then rejects — exactly the false green this module exists to prevent
 * (TASK-MTSYAKDK5LV9E). That property is why the answer moved *into* this file
 * rather than a second resolver appearing next to the new country table.
 *
 * ## What changed on 2026-09-08: the rate follows the buyer
 *
 * The boss decided that catalogue prices are VAT-exclusive and that VAT is
 * added according to the **buyer's country** (Türkiye 20%, Kuveyt 0%). A single
 * server-wide percentage cannot express that: it is right for at most one
 * country and silently wrong for every other.
 *
 * So `resolveVatRate` is the only way an invoice gets a rate, and it reads
 * `./vat-rates`. The server setting that used to decide it was **removed** on
 * 2026-09-09 (TASK-MTTTMECDO7RC8): it had stopped deciding anything on
 * 2026-09-08, and a variable that is parsed but powerless is a standing
 * invitation to configure a tax rate that never reaches an invoice.
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

/**
 * Where an invoice's tax country comes from, and why it is not `Tenant.country`.
 *
 * `Tenant.country` is a self-declared display field: a tenant picks it during
 * onboarding and nothing checks it. A tax rate is a legal determination, and
 * basing one on an unverified self-declaration would let a buyer choose their
 * own VAT by editing a profile field. `TenantBillingIdentity` is the buyer's
 * fiscal identity — the VKN/TCKN, tax office and address a taxpayer supplied
 * for invoicing — and it is the only country this resolver will read.
 *
 * A tenant with no billing identity therefore has no tax country, and no
 * invoice: the writer already refuses that case (`buyer_identity_missing`).
 */
export type VatRateResolution =
  | { status: 'resolved'; ratePercent: number; country: string; source: string; effectiveFrom: string }
  | { status: 'country_missing'; detail: string }
  | { status: 'country_not_in_table'; country: string; detail: string }
  /**
   * The country is in the table, but how the sale is treated has not been
   * decided — the EU members, which a Türkiye-resident supplier does not
   * normally charge VAT to at all. Refused for the same reason as an absent
   * country: knowing the rate is not knowing whether to charge it.
   */
  | { status: 'regime_not_chargeable'; country: string; regime: VatRegime; detail: string };

/**
 * The VAT rate for a buyer in `rawCountry`, or the reason there is none.
 *
 * Never falls back. An unsourced country returns `country_not_in_table` and the
 * caller does not issue an invoice — "it is probably 20%" is a made-up figure on
 * a fiscal document, exactly what ADR-0002 forbade for exchange rates. `0` is a
 * real, resolved answer (Kuwait levies no VAT) and must not be confused with it.
 */
export function resolveVatRate(rawCountry: string | null | undefined): VatRateResolution {
  const trimmed = typeof rawCountry === 'string' ? rawCountry.trim() : '';
  if (trimmed === '') {
    return {
      status: 'country_missing',
      detail: "the buyer's billing identity carries no country, so no VAT rate can be determined",
    };
  }

  const row: CountryVatRate | null = findCountryVatRate(trimmed);
  if (!row) {
    return {
      status: 'country_not_in_table',
      country: trimmed,
      detail: `no sourced VAT rate for ${trimmed}; src/lib/billing/vat-rates.ts can charge ${chargeableVatCountries().join(', ')}`,
    };
  }

  if (row.regime !== 'standard') {
    return {
      status: 'regime_not_chargeable',
      country: row.country,
      regime: row.regime,
      detail:
        `${row.country} is in the table at ${row.ratePercent}% but its regime is "${row.regime}", ` +
        `so no rate may be charged. A Türkiye-resident supplier does not normally charge EU VAT ` +
        `(reverse charge / OSS); a tax adviser has to rule before this becomes "standard".`,
    };
  }

  return {
    status: 'resolved',
    ratePercent: row.ratePercent,
    country: row.country,
    source: row.source,
    effectiveFrom: row.effectiveFrom,
  };
}

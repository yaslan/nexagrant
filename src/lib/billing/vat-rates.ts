/**
 * The VAT rate that applies to a sale, by the buyer's country.
 *
 * Boss decision, 2026-09-08: **catalogue prices are VAT-exclusive, and VAT is
 * added according to the buyer's country** — "Türkiye %20, Kuveyt %0". Before
 * it, one server setting (`INVOICE_VAT_RATE`) decided the tax on every invoice
 * regardless of who bought, which can only be right for one country at a time.
 *
 * ## Why this is a table with sources and not a lookup someone typed
 *
 * A VAT rate is a legal fact with a date attached, not a constant. CLAUDE.md
 * rule 7 asks every figure shown to a user to be tied to a record; a tax rate
 * printed on a fiscal document deserves at least that. So each row carries
 * where the rate comes from and when it took effect, and a country nobody has
 * sourced is **absent** rather than guessed.
 *
 * ## Absence is an answer
 *
 * There is no default and no nearest neighbour. A country missing from this
 * table means "we do not know what this sale is taxed at", and the invoice
 * writer refuses to issue rather than assuming 20% (or 0%). Assuming 20% would
 * overcharge a buyer in a country with no VAT; assuming 0% would leave Fabrika
 * owing a tax it never collected. Both are inventions on a fiscal document —
 * the same rule the TCMB outage decision applies to exchange rates (ADR-0002).
 *
 * ## Adding a country
 *
 * One row, with a source a person can check and the date the rate took effect.
 * Do not add a country from memory, and do not copy a rate from a blog post.
 * "Reduced" and sector-specific rates are deliberately not modelled: Fabrika
 * sells one kind of thing (a SaaS subscription), so one standard rate per
 * country is the whole question here. If that stops being true, this table
 * grows a product dimension — it does not grow a special case in a caller.
 */

/**
 * How a sale to this country is treated, which is a separate question from the
 * rate.
 *
 * Added when the table was widened to the EU (boss, 2026-09-08). Holding a rate
 * for a country is not the same as saying "we charge this": a Türkiye-resident
 * supplier does not normally charge EU VAT at all — B2B supplies to another
 * member state are usually the customer's own liability under the reverse
 * charge, and B2C digital services run through OSS registration. A table of
 * bare rates would quietly invite invoicing all 27 at their standard rate.
 *
 * - `standard`      — charge this country's rate. The only regime that invoices.
 * - `reverse_charge` — the customer accounts for the tax; the supplier charges none.
 * - `exempt`        — the supply is outside VAT.
 * - `unknown`       — the treatment has not been determined. Behaves exactly like
 *                     a country that is missing from the table: no invoice.
 *
 * Only `standard` issues an invoice today. `reverse_charge` and `exempt` are
 * declared so the shape can carry the distinction once a tax adviser rules on
 * it; nothing selects them yet, and no caller may treat them as chargeable.
 */
export type VatRegime = 'standard' | 'reverse_charge' | 'exempt' | 'unknown';

/** A country's standard VAT rate, with the evidence for it. */
export interface CountryVatRate {
  /** ISO 3166-1 alpha-2, uppercase. The canonical key. */
  readonly country: string;
  /**
   * Standard rate in percent. **Not an integer**: Finland is 25.5. Amounts stay
   * whole minor units (CLAUDE.md rule 9) — it is the *rate* that has a fraction,
   * and `vatOnNetMinor` rounds the product, not the rate.
   */
  readonly ratePercent: number;
  /** How this sale is treated. Only `standard` produces an invoice. */
  readonly regime: VatRegime;
  /** Where the rate can be checked. Named legislation, not "the internet". */
  readonly source: string;
  /**
   * `YYYY-MM-DD` — the earliest date this rate can be evidenced as in force.
   *
   * For a row sourced from named legislation that is the date the law took
   * effect. For a row sourced from a dated survey it is that survey's data
   * date: the rate was in force on that day, and the survey does not say when
   * it started. The distinction matters only for back-dated invoices, and every
   * survey-sourced row is `regime: 'unknown'` today, so none can be invoiced.
   */
  readonly effectiveFrom: string;
  /**
   * Spellings that may reach us for this country. `Invoice.buyerCountry` and
   * `TenantBillingIdentity.buyerCountry` are free text with the default
   * "Türkiye", so a lookup by ISO code alone would fail on the most common
   * value in the database. Compared case- and accent-insensitively.
   */
  readonly aliases: readonly string[];
}

/**
 * Every country Fabrika can currently work out the VAT for.
 *
 * Two rows today, and that is the honest size of what has been sourced. The
 * table is deliberately short rather than deliberately complete: a long list of
 * unverified rates would look more finished and be less true.
 */
export const COUNTRY_VAT_RATES: readonly CountryVatRate[] = [
  {
    country: 'TR',
    ratePercent: 20,
    regime: 'standard',
    // Standard KDV rate raised from 18% to 20% by Presidential Decree 7346,
    // published in the Resmî Gazete on 2023-07-07 and in force from 2023-07-10.
    source: 'Cumhurbaşkanı Kararı 7346 (Resmî Gazete 32241, 2023-07-07) — KDV genel oranı %20',
    effectiveFrom: '2023-07-10',
    aliases: ['TR', 'TUR', 'TÜRKİYE', 'TURKIYE', 'TURKEY', 'TURKIYE CUMHURIYETI'],
  },
  {
    country: 'KW',
    ratePercent: 0,
    // `standard` at 0, not `exempt`: `exempt` means a VAT exists and this supply
    // is outside it. Kuwait has no VAT law at all, so the rate in force is zero.
    regime: 'standard',
    // Kuwait signed the GCC VAT Framework Agreement but has not enacted a VAT
    // law; no VAT is levied. The rate is 0 because none is in force — not
    // because the sale is exempt from one that exists.
    source: 'GCC VAT Framework Agreement — Kuveyt uygulamaya koymadı; yürürlükte KDV yok',
    effectiveFrom: '2018-01-01',
    aliases: ['KW', 'KWT', 'KUWAIT', 'KUVEYT'],
  },

  // ---------------------------------------------------------------------------
  // The 27 EU member states (boss, 2026-09-08 — scope widened after this card
  // was written; recorded in .agentspace/memory/shared/
  // fabrika-prices-are-vat-exclusive-per-country.md).
  //
  // Every one of them is `regime: 'unknown'`, so **none of them can be invoiced
  // today** — they behave exactly like a country that is absent from the table.
  // They are here so the rate is not re-derived from memory on the day a tax
  // adviser rules on the regime, not because anything is about to charge them.
  //
  // Rates verified against the Tax Foundation table (data date 2026-01-26,
  // itself citing the European Commission's Taxes in Europe Database v4), and
  // independently against euvat.dev by another agent on the same day; the two
  // agreed, including the one that breaks a naive schema: Finland is 25.5, not
  // an integer.
  // ---------------------------------------------------------------------------
  {
    country: 'AT',
    ratePercent: 20,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['AT', 'AUSTRIA', 'AVUSTURYA'],
  },
  {
    country: 'BE',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['BE', 'BELGIUM', 'BELÇIKA'],
  },
  {
    country: 'BG',
    ratePercent: 20,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['BG', 'BULGARIA', 'BULGARISTAN'],
  },
  {
    country: 'HR',
    ratePercent: 25,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['HR', 'CROATIA', 'HIRVATISTAN'],
  },
  {
    country: 'CY',
    ratePercent: 19,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['CY', 'CYPRUS', 'KIBRIS'],
  },
  {
    country: 'CZ',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['CZ', 'CZECHIA', 'ÇEKYA', 'CZECH REPUBLIC'],
  },
  {
    country: 'DK',
    ratePercent: 25,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['DK', 'DENMARK', 'DANIMARKA'],
  },
  {
    country: 'EE',
    ratePercent: 24,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['EE', 'ESTONIA', 'ESTONYA'],
  },
  {
    country: 'FI',
    ratePercent: 25.5,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['FI', 'FINLAND', 'FINLANDIYA'],
  },
  {
    country: 'FR',
    ratePercent: 20,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['FR', 'FRANCE', 'FRANSA'],
  },
  {
    country: 'DE',
    ratePercent: 19,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['DE', 'GERMANY', 'ALMANYA'],
  },
  {
    country: 'GR',
    ratePercent: 24,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['GR', 'GREECE', 'YUNANISTAN'],
  },
  {
    country: 'HU',
    ratePercent: 27,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['HU', 'HUNGARY', 'MACARISTAN'],
  },
  {
    country: 'IE',
    ratePercent: 23,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['IE', 'IRELAND', 'İRLANDA'],
  },
  {
    country: 'IT',
    ratePercent: 22,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['IT', 'ITALY', 'İTALYA'],
  },
  {
    country: 'LV',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['LV', 'LATVIA', 'LETONYA'],
  },
  {
    country: 'LT',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['LT', 'LITHUANIA', 'LITVANYA'],
  },
  {
    country: 'LU',
    ratePercent: 17,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['LU', 'LUXEMBOURG', 'LÜKSEMBURG'],
  },
  {
    country: 'MT',
    ratePercent: 18,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['MT', 'MALTA', 'MALTA'],
  },
  {
    country: 'NL',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['NL', 'NETHERLANDS', 'HOLLANDA'],
  },
  {
    country: 'PL',
    ratePercent: 23,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['PL', 'POLAND', 'POLONYA'],
  },
  {
    country: 'PT',
    ratePercent: 23,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['PT', 'PORTUGAL', 'PORTEKIZ'],
  },
  {
    country: 'RO',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['RO', 'ROMANIA', 'ROMANYA'],
  },
  {
    country: 'SK',
    ratePercent: 23,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['SK', 'SLOVAKIA', 'SLOVAKYA'],
  },
  {
    country: 'SI',
    ratePercent: 22,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['SI', 'SLOVENIA', 'SLOVENYA'],
  },
  {
    country: 'ES',
    ratePercent: 21,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['ES', 'SPAIN', 'İSPANYA'],
  },
  {
    country: 'SE',
    ratePercent: 25,
    // `unknown`, not `standard`: having the rate is not a decision to charge it.
    // A Türkiye-resident supplier does not normally charge EU VAT — see VatRegime.
    regime: 'unknown',
    source: 'Tax Foundation, \"VAT Rates in Europe\" (veri tarihi 2026-01-26) ← EC Taxes in Europe Database v4',
    effectiveFrom: '2026-01-26',
    aliases: ['SE', 'SWEDEN', 'İSVEÇ'],
  },
] as const;

/**
 * Compare two country spellings without tripping over case or Turkish accents.
 *
 * `toUpperCase()` alone is not enough in either direction: "Türkiye" upper-cases
 * to "TÜRKIYE" under the invariant locale and "TÜRKİYE" under `tr`, so a plain
 * comparison against a literal fails on exactly the value the schema uses as its
 * default. Stripping diacritics after NFD sidesteps the locale question entirely.
 */
export function normaliseCountryKey(raw: string): string {
  return raw
    .normalize('NFD')
    // The combining marks NFD just split off (̀-ͯ), written as escapes so
    // the source stays readable in an editor that hides them.
    .replace(/[\u0300-\u036f]/g, '')
    // Dotless ı has no decomposition of its own, and dotted İ has already lost
    // its dot above to the line before; both have to land on plain I.
    .replace(/[\u0130\u0131]/g, 'I')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** The row for a country spelling, or null when nobody has sourced one. */
export function findCountryVatRate(rawCountry: string | null | undefined): CountryVatRate | null {
  if (!rawCountry) return null;
  const key = normaliseCountryKey(rawCountry);
  if (key === '') return null;
  return (
    COUNTRY_VAT_RATES.find(
      (row) => normaliseCountryKey(row.country) === key || row.aliases.some((alias) => normaliseCountryKey(alias) === key)
    ) ?? null
  );
}

/** Every country the table holds a rate for, chargeable or not. */
export function supportedVatCountries(): string[] {
  return COUNTRY_VAT_RATES.map((row) => row.country);
}

/**
 * The countries a sale can actually be invoiced to today.
 *
 * The one an operator-facing message should quote: "the table covers 29
 * countries" would be true and misleading, because 27 of them refuse.
 */
export function chargeableVatCountries(): string[] {
  return COUNTRY_VAT_RATES.filter((row) => row.regime === 'standard').map((row) => row.country);
}

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — minimum-partner pre-filter for M8 candidates.
 *
 * Specification (NexaGrant/markdown/02-Yazilim-Sartnamesi.md):
 *  - §6, l.103 "Ön filtre (zorunlu): uygun ülkeler, asgari ortak sayısı, kurum
 *    türü, konsorsiyumda ihtiyaç duyulan tipik rol."
 *  - §4, l.50 the `call` record carries "asgari ortak": the threshold belongs to
 *    each call, so it is read from `Topic.eligibility.minPartners/minCountries`
 *    (written by the SEDIA adapter, src/lib/adapters/schemas/common.ts
 *    parseMinimumConsortium). No number is written here: a call that states none
 *    gets no filter, not a guessed default (same stance as DEFAULT_GATE_RULES.G1).
 *
 * As a candidate filter the rule bites in one place: when the consortium still
 * lacks countries and every remaining open seat must bring a new one, a candidate
 * from a country already held (or with no recorded country) cannot get the
 * proposal to the call minimum, so it is dropped. A seat plan too small to reach
 * the partner count is not filtered here: no single candidate fixes that, it is
 * the G1 check's business.
 */

export interface MinimumPartnerRule {
  /** Minimum number of partners the call asks for; null = the call states none. */
  minPartners: number | null;
  /** Minimum number of distinct countries; null = the call states none. */
  minCountries: number | null;
}

export interface MinimumPartnerState {
  rule: MinimumPartnerRule;
  confirmedPartners: number;
  takenCountries: ReadonlySet<string>;
  /** Seats still to fill, the one being matched included (never below 1). */
  openSeats: number;
  /** Countries still missing to reach `minCountries` (0 when unknown or met). */
  countryShortfall: number;
  /** Every remaining seat must bring a country the consortium does not hold yet. */
  requiresNewCountry: boolean;
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** The call threshold off a `Topic.eligibility` JSON value; anything unreadable is "unknown". */
export function readMinimumPartnerRule(eligibility: unknown): MinimumPartnerRule {
  if (!eligibility || typeof eligibility !== 'object') return { minPartners: null, minCountries: null };
  const source = eligibility as Record<string, unknown>;
  return { minPartners: positiveInt(source.minPartners), minCountries: positiveInt(source.minCountries) };
}

/**
 * @param seatStatuses status of every seat on the opportunity (`CONFIRMED` counts as held).
 * @param takenCountries countries of the CONFIRMED partners.
 */
export function minimumPartnerState(
  rule: MinimumPartnerRule,
  seatStatuses: readonly string[],
  takenCountries: ReadonlySet<string>
): MinimumPartnerState {
  const confirmedPartners = seatStatuses.filter((s) => s === 'CONFIRMED').length;
  // The seat being matched is open by definition, even if a caller's plan omits it.
  const openSeats = Math.max(1, seatStatuses.length - confirmedPartners);
  const countryShortfall = rule.minCountries === null ? 0 : Math.max(0, rule.minCountries - takenCountries.size);
  return {
    rule,
    confirmedPartners,
    takenCountries,
    openSeats,
    countryShortfall,
    requiresNewCountry: countryShortfall > 0 && countryShortfall >= openSeats,
  };
}

/** Does a candidate from `country` keep the consortium able to reach the call minimum? */
export function passesMinimumPartnerFilter(country: string | null, state: MinimumPartnerState): boolean {
  if (!state.requiresNewCountry) return true;
  return country !== null && !state.takenCountries.has(country);
}

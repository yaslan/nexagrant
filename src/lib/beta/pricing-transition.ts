/**
 * E11.4 — v1.0 → v1.1 transition policy for the E11 beta cohort (TASK-MTQ3DZS6W6DFC).
 *
 * These are the commercial rules a beta design partner is offered when the beta
 * closes: how much they pay, for how long that price is protected against a v1.1
 * list-price change, and what happens to the modules the beta switched on for them.
 *
 * Why the policy is code and not only prose: the numbers have to be applied
 * identically by the offer letter, the Stripe coupon that is created from it and
 * the entitlement check that honours the price lock. A table in a Markdown file
 * drifts from all three. `docs/E11-PRICING-FEEDBACK.md` renders itself from these
 * constants, so the document cannot contradict the implementation.
 *
 * The discount percentages are the one lever that the week-7 survey re-tunes; they
 * are deliberately isolated in TRANSITION_TIERS so that re-tuning is a one-constant
 * change with the tests as the guard rail.
 *
 * Money: Int minor units (cents). Dates: UTC.
 */

export const BETA_COHORT_ID = 'E11';

/** Last weekly check-in / beta close, per docs/BETA_GUIDE.md §7. */
export const BETA_ENDS_ON = '2026-10-29';

/**
 * General availability of the paid product. Two weeks after the beta closes so the
 * partners have the closing report and a signed offer before the first invoice.
 */
export const GA_DATE = '2026-11-16';

/** Total weekly check-ins in the programme (BETA_CHECKIN_WEEKS). */
export const BETA_CHECKIN_TOTAL = 8;

export type TransitionTier = 'founding' | 'contributor' | 'alumni';

export interface TransitionTierRule {
  tier: TransitionTier;
  /** Percentage off the catalogue list price of the chosen plan and cycle. */
  discountPct: number;
  /** Months the discount is honoured, counted from GA. */
  discountMonths: number;
  /**
   * Months during which a v1.1 list-price increase does not reach this tenant.
   * 0 means the tenant moves onto the then-current list price the moment the
   * discount period ends.
   */
  priceLockMonths: number;
  /** One-off AI credits granted at GA. Beta credits themselves do not carry over. */
  welcomeCredits: number;
  /** Minimum weekly check-ins attended to qualify. */
  minCheckins: number;
  /** Whether reaching gate G2 with at least one proposal is required. */
  requiresG2: boolean;
  rationaleTr: string;
  rationaleEn: string;
}

/**
 * Ordered strongest first — `resolveBetaTransition` takes the first tier whose
 * conditions are met, so the order is part of the policy.
 *
 * The conditions are engagement, not spend: a partner who showed up and drove a
 * proposal to G2 gave us the calibration data E11.3 needs, and that is what the
 * discount buys. A partner who took the free licence and never appeared did not.
 */
export const TRANSITION_TIERS: readonly TransitionTierRule[] = [
  {
    tier: 'founding',
    discountPct: 40,
    discountMonths: 12,
    priceLockMonths: 24,
    welcomeCredits: 500,
    minCheckins: 5,
    requiresG2: true,
    rationaleTr:
      '8 sync’in en az 5’ine katıldı ve en az bir teklifi G2’ye taşıdı — ürünü gerçekten kullandı ve ' +
      'G0 kalibrasyonuna veri verdi.',
    rationaleEn:
      'Attended at least 5 of the 8 check-ins and drove at least one proposal to G2 — really used the ' +
      'product and fed the G0 calibration.',
  },
  {
    tier: 'contributor',
    discountPct: 25,
    discountMonths: 12,
    priceLockMonths: 12,
    welcomeCredits: 250,
    minCheckins: 3,
    requiresG2: false,
    rationaleTr: 'Düzenli katıldı ama teklif hattını uçtan uca çalıştırmadı.',
    rationaleEn: 'Took part regularly but did not run the pipeline end to end.',
  },
  {
    tier: 'alumni',
    discountPct: 15,
    discountMonths: 6,
    priceLockMonths: 0,
    welcomeCredits: 0,
    minCheckins: 0,
    requiresG2: false,
    rationaleTr: 'Beta hesabı açıldı; katılım sınırlı kaldı. Yine de kapıdan boş çıkmaz.',
    rationaleEn: 'The beta account was opened but engagement stayed limited. Still not sent away empty-handed.',
  },
];

/**
 * Modules the beta switched on that fall outside the plan the partner buys stay in
 * `pilot` for this long after GA, then drop to `off` with the data preserved.
 * Mirrors the "conscious enable" principle in BILLING.md §2: nothing is switched on
 * silently, and nothing is switched off without a window to decide in.
 */
export const PILOT_GRACE_DAYS = 60;

/**
 * When the price lock expires, a list-price increase is capped at this much per
 * twelve months, and needs this much written notice — the same notice period the
 * TRY price list already promises in BILLING.md §4.
 */
export const POST_LOCK_ANNUAL_UPLIFT_CAP_PCT = 20;
export const PRICE_CHANGE_NOTICE_DAYS = 60;

/**
 * A tenant that sits on the `free` plan for this many consecutive days forfeits the
 * cohort discount; the price lock is not a dormant asset to be reactivated years later.
 */
export const DORMANCY_FORFEIT_DAYS = 90;

export interface TransitionInput {
  /** Weekly check-ins attended, 0…BETA_CHECKIN_TOTAL. */
  checkinsAttended: number;
  /** At least one proposal reached gate G2 during the beta. */
  reachedG2: boolean;
  planId: string;
  /** Catalogue price of the chosen plan for the chosen cycle, in cents. */
  listCents: number;
  cycle: 'monthly' | 'annual';
  /** GA date, ISO yyyy-mm-dd. Defaults to GA_DATE. */
  gaDate?: string;
}

export interface TransitionOffer {
  cohort: string;
  tier: TransitionTier;
  discountPct: number;
  listCents: number;
  payableCents: number;
  savingCents: number;
  cycle: 'monthly' | 'annual';
  planId: string;
  discountEndsOn: string;
  priceLockEndsOn: string | null;
  pilotGraceEndsOn: string;
  welcomeCredits: number;
  reasonTr: string;
  reasonEn: string;
}

function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match?.[1] || !match[2] || !match[3]) throw new Error(`Expected a yyyy-mm-dd date, got "${iso}"`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) throw new Error(`"${iso}" is not a real date`);
  return date;
}

function toIso(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return iso;
}

/** Calendar-month arithmetic that clamps 31 Jan + 1 month to 28/29 Feb. */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return toIso(shifted);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function resolveTier(checkinsAttended: number, reachedG2: boolean): TransitionTierRule {
  if (!Number.isInteger(checkinsAttended) || checkinsAttended < 0 || checkinsAttended > BETA_CHECKIN_TOTAL) {
    throw new Error(`checkinsAttended must be a whole number in 0…${BETA_CHECKIN_TOTAL}`);
  }
  const rule = TRANSITION_TIERS.find(
    (t) => checkinsAttended >= t.minCheckins && (!t.requiresG2 || reachedG2)
  );
  // The last tier has no conditions, so this cannot be undefined — but the type
  // system does not know that, and a future edit to the table could break it.
  if (!rule) throw new Error('No transition tier matched — TRANSITION_TIERS must end in an unconditional tier');
  return rule;
}

/**
 * The offer a beta partner receives at GA.
 *
 * The discount applies to the catalogue price of the cycle they choose, so the
 * annual −20% in BILLING.md is not re-applied here — annual partners get the
 * cohort discount off the already-annualised list price rather than a compounded
 * figure nobody can reconcile against an invoice.
 */
export function resolveBetaTransition(input: TransitionInput): TransitionOffer {
  if (!Number.isInteger(input.listCents) || input.listCents < 0) {
    throw new Error('listCents must be a non-negative whole number of cents');
  }
  const rule = resolveTier(input.checkinsAttended, input.reachedG2);
  const gaDate = input.gaDate ?? GA_DATE;
  parseIsoDate(gaDate);

  const payableCents = Math.round(input.listCents * (1 - rule.discountPct / 100));

  return {
    cohort: BETA_COHORT_ID,
    tier: rule.tier,
    discountPct: rule.discountPct,
    listCents: input.listCents,
    payableCents,
    savingCents: input.listCents - payableCents,
    cycle: input.cycle,
    planId: input.planId,
    discountEndsOn: addMonths(gaDate, rule.discountMonths),
    priceLockEndsOn: rule.priceLockMonths > 0 ? addMonths(gaDate, rule.priceLockMonths) : null,
    pilotGraceEndsOn: addDays(gaDate, PILOT_GRACE_DAYS),
    welcomeCredits: rule.welcomeCredits,
    reasonTr: rule.rationaleTr,
    reasonEn: rule.rationaleEn,
  };
}

/**
 * Catalogue list prices, in EUR cents, mirroring the plan rows seeded in
 * `prisma/seed.ts` §2 (and the table in `docs/BILLING.md` §1).
 *
 * Duplicated here so the offer maths and the report stay pure — no database in a
 * pure function. `tests/beta/pricing-transition.test.ts` reads `prisma/seed.ts` and
 * fails if the two ever disagree, so the duplicate cannot rot silently.
 */
export const CATALOGUE_LIST_CENTS: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 5900, annual: 56600 },
  team: { monthly: 24900, annual: 239000 },
  business: { monthly: 59900, annual: 575000 },
  enterprise: { monthly: 150000, annual: 1440000 },
};

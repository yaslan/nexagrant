/**
 * NexaGrant plan catalogue — the vocabulary (NG-57, design: NG-244 §6.1).
 *
 * NexaGrant sells its own tiers (Ücretsiz Kontrol / Temel / Profesyonel / Kurumsal,
 * `06-Fiyat-Politikasi.md` §1) under its OWN plan ids (K-584182 = A): the Fabrika
 * `Plan` / `Subscription` rows and `src/lib/billing/catalog.ts` are not touched, so a
 * NexaGrant price or seat change can never move a Fabrika customer.
 *
 * This file holds names only — feature keys, currencies, intervals. Which plan gets
 * which feature, every limit, every price and every trial length is DATA: the
 * `NgPlan*` / `NgTrialPolicy` tables, written by `prisma/seed-data/nexagrant-catalog.ts`
 * and read at runtime from the database. No number lives here.
 */

/** Plan ids. A closed list so a typo is a compile error; the rows themselves are data. */
export const NG_PLAN_IDS = ['ng-free', 'ng-basic', 'ng-pro', 'ng-enterprise'] as const;
export type NgPlanId = (typeof NG_PLAN_IDS)[number];

export function isNgPlanId(value: string): value is NgPlanId {
  return (NG_PLAN_IDS as readonly string[]).includes(value);
}

/**
 * The capabilities a tier is sold with (S1 scope of `06` §1). A plan grants a
 * feature when the matrix has a row for it; `limitValue` on that row meters it
 * (null = unlimited).
 */
export const NG_FEATURE_KEYS = [
  /** Organisation profile. Every tier. */
  'org_profile',
  /** Eligibility check of the organisation against a call. Metered per Istanbul month on the free tier. */
  'eligibility_check',
  /** Call search and the eligibility filter. */
  'call_search',
  /** TRL fit scoring. */
  'trl_score',
  /** Apply / withdraw record on a call. */
  'apply_decision',
  /** Newsletter of matching calls. */
  'newsletter',
  /** Partner finding. */
  'partner_search',
  /** Partner outreach (invite, remind). */
  'outreach',
  /** Similar funded projects. */
  'similar_projects',
  /** Member seats of the organisation. A limit only; null = unlimited. */
  'seats',
  /** AI writing operations per month. */
  'ai_writing_monthly',
] as const;
export type NgFeatureKey = (typeof NG_FEATURE_KEYS)[number];

export function isNgFeatureKey(value: string): value is NgFeatureKey {
  return (NG_FEATURE_KEYS as readonly string[]).includes(value);
}

/** K-584156 = A: TL and euro only. */
export const NG_CURRENCIES = ['TRY', 'EUR'] as const;
export type NgCurrency = (typeof NG_CURRENCIES)[number];

export function isNgCurrency(value: string): value is NgCurrency {
  return (NG_CURRENCIES as readonly string[]).includes(value);
}

export const NG_INTERVALS = ['year', 'month'] as const;
export type NgInterval = (typeof NG_INTERVALS)[number];
export function isNgInterval(value: string): value is NgInterval {
  return (NG_INTERVALS as readonly string[]).includes(value);
}

/** Trial segments (`06` §4; K-584180 = A). */
export const NG_TRIAL_SEGMENTS = ['default', 'municipality'] as const;
export type NgTrialSegment = (typeof NG_TRIAL_SEGMENTS)[number];

/** `NgSubscription.provider` of a trial started at registration. Not a payment provider. */
export const NG_TRIAL_PROVIDER = 'ng-trial';

import type { NgPlanFeatureRow, NgPlanPriceRow, NgPlanRow } from '../../src/lib/billing/nexagrant/entitlement';
import { NG_CURRENCIES, NG_INTERVALS } from '../../src/lib/billing/nexagrant/features';
import type { NgTrialPolicyRow } from '../../src/lib/billing/nexagrant/trial';

/**
 * NG-57 — the NexaGrant plan catalogue as data: the one place its numbers are written.
 * Sources: 06-Fiyat-Politikasi.md §1 (S1 scope), §4 (seats), §7 (trial); NG-244 §6.1;
 * K-584180 = A (14 days, municipalities 30), K-584156 = A (TRY and EUR only),
 * K-584182 = A (own plan ids, not Fabrika's free/basic/pro/ultra).
 *
 * Written to the database by prisma/seed-nexagrant-catalog.ts as the owning role.
 * src/lib/billing/nexagrant/nexagrant-catalog.test.ts re-types the matrix by hand: a change
 * here is a change there too.
 *
 * Prices: NO amount is set here, on purpose (the NG-57 card: price and currency are not
 * produced by this card; the amounts wait on the accountant). Every cell is seeded with
 * `amountMinor: null` = not purchasable, and the seed never overwrites an amount that was
 * entered later.
 *
 * Ücretsiz Kontrol's single seat is not stated in 06; it is this card's choice (one
 * organisation profile, one user), reported as an open point.
 */

export const NG_PLANS: readonly NgPlanRow[] = [
  { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
  { id: 'ng-basic', tier: 'basic', sortOrder: 2, sellable: true, isFallback: false },
  { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false },
  // Kurumsal is S2: shown with "ön kayıt", never sold in S1 (06 §1).
  { id: 'ng-enterprise', tier: 'enterprise', sortOrder: 4, sellable: false, isFallback: false },
];

const unlimited = null;

const FREE: readonly [string, number | null][] = [
  ['org_profile', unlimited],
  ['eligibility_check', 3], // 3 per month (06 §1)
  ['seats', 1],
];

const BASIC: readonly [string, number | null][] = [
  ['org_profile', unlimited],
  ['eligibility_check', unlimited],
  ['call_search', unlimited],
  ['trl_score', unlimited],
  ['apply_decision', unlimited],
  ['newsletter', unlimited],
  ['seats', 2],
];

const PRO_EXTRA: readonly [string, number | null][] = [
  ['partner_search', unlimited],
  ['outreach', unlimited],
  ['similar_projects', unlimited],
];

const PRO: readonly [string, number | null][] = [
  ...BASIC.filter(([k]) => k !== 'seats'),
  ...PRO_EXTRA,
  ['seats', 5],
  ['ai_writing_monthly', 50],
];

const ENTERPRISE: readonly [string, number | null][] = [
  ...PRO.filter(([k]) => k !== 'seats' && k !== 'ai_writing_monthly'),
  ['seats', unlimited],
  ['ai_writing_monthly', 300],
];

const cells = (planId: string, rows: readonly [string, number | null][]): NgPlanFeatureRow[] =>
  rows.map(([featureKey, limitValue]) => ({ planId, featureKey, limitValue }));

export const NG_PLAN_FEATURES: readonly NgPlanFeatureRow[] = [
  ...cells('ng-free', FREE),
  ...cells('ng-basic', BASIC),
  ...cells('ng-pro', PRO),
  ...cells('ng-enterprise', ENTERPRISE),
];

export const NG_PLAN_PRICES: readonly NgPlanPriceRow[] = NG_PLANS.flatMap((plan) =>
  NG_CURRENCIES.flatMap((currency) =>
    NG_INTERVALS.map((interval) => ({ planId: plan.id, currency, interval, amountMinor: null }))
  )
);

export const NG_TRIAL_POLICIES: readonly NgTrialPolicyRow[] = [
  { segment: 'default', days: 14, planId: 'ng-pro', endPlanId: 'ng-free' },
  { segment: 'municipality', days: 30, planId: 'ng-pro', endPlanId: 'ng-free' },
];

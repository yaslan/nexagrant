import { NO_DISCOUNT_TIER, PLAN_GRANTS, type DiscountTier } from '@/lib/billing/catalog';
import { priceStorefrontPlan, type StorefrontPlan, type StorefrontPlanCards } from '@/lib/billing/storefront';

/**
 * Storefront cards for component tests, built by the real pricing code.
 *
 * The panels under test no longer price anything themselves — the server hands
 * them `StorefrontPlanCards` computed from published `PlanVersion` rows
 * (TASK-MTSHVKTSGC8A4). A fixture with prices typed into it would let the
 * panels render a number the pricing code would never produce, so this builds
 * the cards through `priceStorefrontPlan` and takes the plan's shape from
 * `PLAN_GRANTS`, which is what `prisma/seed.ts` writes those rows from.
 *
 * Prices are the seeded list figures, so a test asserting on "$87.00 Pro" is
 * asserting on the same arithmetic production runs.
 */
const SEEDED_LIST_MINOR: Record<string, { monthly: number; yearly: number }> = {
  basic: { monthly: 4_500, yearly: 38_700 },
  pro: { monthly: 8_700, yearly: 74_700 },
  ultra: { monthly: 14_700, yearly: 119_700 },
};

export function storefrontPlanFixture(planId: keyof typeof SEEDED_LIST_MINOR): StorefrontPlan {
  const grant = PLAN_GRANTS.find((entry) => entry.planId === planId);
  if (!grant) throw new Error(`No grant for plan ${planId}`);
  const list = SEEDED_LIST_MINOR[planId]!;
  return {
    planId,
    sku: `plan-${planId}`,
    name: grant.name,
    visibility: 'public',
    versionId: `pv_${planId}_1`,
    version: 1,
    currency: 'USD',
    monthlyListMinor: list.monthly,
    yearlyListMinor: list.yearly,
    seats: grant.seats,
    workspaces: grant.workspaces,
    aiCreditsMonthly: grant.aiCreditsMonthly,
    modules: [...grant.moduleIds],
    features: [],
  };
}

/** The three purchasable plans, priced under `tier`. */
export function storefrontCardsFixture(tier: DiscountTier = NO_DISCOUNT_TIER): StorefrontPlanCards[] {
  return (['basic', 'pro', 'ultra'] as const).map((planId) =>
    priceStorefrontPlan(storefrontPlanFixture(planId), tier, NO_DISCOUNT_TIER)
  );
}

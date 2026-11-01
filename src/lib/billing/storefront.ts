/**
 * The shopfront: which plans a given tenant may see, and what they cost.
 *
 * TASK-MTSHVKTSGC8A4 (step 3 of the plan studio). Phase 1 gave the studio a
 * versioned `PlanVersion` table, a `visibility` flag on `Plan` and a
 * `PlanAssignment` table for private plans — and nothing read any of it.
 * Measured on 2026-09-08 against the running app: setting
 * `PlanVersion.monthlyCents` for `ultra` to 99900 left `/tr/pricing` quoting
 * $99.75 and `POST /api/billing/checkout` charging 14700, and marking `basic`
 * `private` with zero assignments left it on the public pricing page and
 * buyable by anybody. The three customer surfaces read the static array in
 * `catalog.ts`, so a plan published in the studio could not be bought.
 *
 * This module is that missing half. Two rules it exists to keep:
 *
 *   1. **The price is resolved on the server.** The browser says *which* plan,
 *      never *how much* — the vulnerability TASK-MTR6Q2IODYQRC closed, where
 *      Ultra could be bought for 50 cents. The pricing page and the billing
 *      panel now receive already-priced lines from their server component, and
 *      checkout re-prices from the database no matter what the request carried.
 *   2. **Visibility gates the purchase, not just the picture.** Hiding a
 *      private plan from a listing is presentation; a tenant that types the sku
 *      by hand must still be refused. `priceLineForTenant` resolves against the
 *      same visible set the listing is built from, so there is one answer to
 *      "may this tenant buy this", not two.
 *
 * The arithmetic is *not* here: a version is shaped into a `PricablePlan` and
 * priced by `priceEntry` in catalog.ts, so the yearly rounding rule
 * (`YEARLY_DERIVATION`) stays stated once.
 */

import { logger } from '@/lib/logger';
import {
  FALLBACK_PLAN_ID,
  MONTHS_PER_YEAR,
  UnknownSkuError,
  priceEntry,
  priceLine,
  findEntry,
  isContractPlan,
  type BillingCycle,
  type DiscountTier,
  type PricablePlan,
  type PricedLine,
} from '@/lib/billing/catalog';
import type { PlanCardFeature } from '@/lib/billing/plan-copy';
import { listPublicPlans, plansVisibleToTenant, type PublishedPlanVersion } from '@/lib/billing/plan-repository';

/**
 * One purchasable plan, as the shopfront knows it: identity and limits from the
 * published version, prices still to be computed under a tier.
 */
export interface StorefrontPlan {
  planId: string;
  /** The sku the cart and checkout speak in (`plan-pro`). */
  sku: string;
  name: string;
  /** `public` or `private`; `archived` never reaches here. */
  visibility: string;
  /** The published version these figures came from — traceable, not decorative. */
  versionId: string;
  version: number;
  currency: string;
  monthlyListMinor: number;
  yearlyListMinor: number;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
  /** The version's card bullets — the only copy a studio-made plan has (plan-copy.ts). */
  features: PlanCardFeature[];
}

/**
 * Raised when a sku names a plan this tenant may not buy — because it does not
 * exist, or because it is private and was never assigned to them.
 *
 * The two are deliberately one error class. The caller answers both with the
 * same message, so the API cannot be used to enumerate which private plans
 * exist; `reason` is for the server log, not the response body.
 */
export class PlanNotAvailableError extends Error {
  constructor(public readonly sku: string, public readonly reason: 'unknown' | 'not-visible') {
    super(`Plan ${sku} is not available to this tenant (${reason})`);
    this.name = 'PlanNotAvailableError';
  }
}

/** `plan-pro` → `pro`, and `PRO` → `pro`. Mirrors `findEntry` in the catalogue. */
function normaliseSku(skuOrPlanId: string): string {
  const wanted = skuOrPlanId.trim().toLowerCase();
  return wanted.startsWith('plan-') ? wanted.slice('plan-'.length) : wanted;
}

function toStorefrontPlan(row: {
  plan: { id: string; name: string; visibility: string };
  version: PublishedPlanVersion;
}): StorefrontPlan {
  return {
    planId: row.plan.id,
    sku: `plan-${row.plan.id}`,
    // The customer-facing name is the version's plan name; the row above is the
    // same `Plan`, so the two cannot disagree.
    name: row.plan.name,
    visibility: row.plan.visibility,
    versionId: row.version.id,
    version: row.version.version,
    currency: row.version.currency,
    monthlyListMinor: row.version.monthlyCents,
    yearlyListMinor: row.version.yearlyCents,
    seats: row.version.seats,
    workspaces: row.version.workspaces,
    aiCreditsMonthly: row.version.aiCreditsMonthly,
    modules: row.version.modules,
    features: (row.version.features ?? []).map(({ kind, moduleId, textTr, textEn }) => ({
      kind,
      moduleId,
      textTr,
      textEn,
    })),
  };
}

/**
 * The free tier is a state a tenant falls into, never a thing it can buy — the
 * rule `catalog.ts` already states for `CATALOG`, applied to the database list
 * so the studio's `Plan` row for it cannot become a $0 "buy" button.
 *
 * A contract plan (the public-sector packages, FB KAMU B11) is excluded for the
 * same reason from the other side: it is assigned by an admin, and the
 * assignment that makes it visible to the tenant must not turn it into a
 * Stripe checkout button.
 */
function purchasable(plan: StorefrontPlan): boolean {
  return plan.planId !== FALLBACK_PLAN_ID && !isContractPlan(plan.planId);
}

/**
 * Plans this tenant may see and buy, newest published version each.
 *
 * `tenantId` null (or a session that has none) means an anonymous visitor: the
 * public list only. A tenant gets the public list plus the private plans
 * assigned to it — the `PlanAssignment` read inside `plansVisibleToTenant`
 * goes through `withTenant`, so a tenant cannot see another's assignment.
 */
export async function storefrontPlans(tenantId: string | null): Promise<StorefrontPlan[]> {
  const rows = tenantId ? await plansVisibleToTenant(tenantId) : await listPublicPlans();
  return rows.map(toStorefrontPlan).filter(purchasable);
}

/** One cycle of one plan: what the tenant pays, and the "was" figure beside it. */
export interface StorefrontPrice {
  /** What the tenant is charged. */
  charged: PricedLine;
  /** The same line with no campaign applied — the "was $X" figure. */
  list: PricedLine;
}

/**
 * One plan card, priced on both cycles by the server.
 *
 * Both cycles travel together because the cycle toggle is a client control:
 * sending the list price and letting the browser discount it is how a visitor
 * came to read one number off a card and be charged another. Every field here
 * is a primitive, so the whole thing crosses the server/client boundary as
 * data — there is no pricing function on the browser side any more.
 */
export interface StorefrontPlanCards {
  plan: StorefrontPlan;
  monthly: StorefrontPrice;
  yearly: StorefrontPrice;
  /**
   * How much cheaper a year is than twelve monthly payments, in whole percent.
   * Computed from this version's own two list figures rather than the "~28%"
   * that used to be typed into the page.
   */
  yearlySavingPercent: number;
}

/** Shapes a storefront plan into something `priceEntry` can price. */
function pricable(plan: StorefrontPlan): PricablePlan {
  return {
    kind: 'plan',
    sku: plan.sku,
    name: plan.name,
    monthlyListMinor: plan.monthlyListMinor,
    yearlyListMinor: plan.yearlyListMinor,
    currency: plan.currency,
  };
}

/** Prices one storefront plan on both cycles, charged and at list. */
export function priceStorefrontPlan(
  plan: StorefrontPlan,
  tier: DiscountTier,
  listTier: DiscountTier
): StorefrontPlanCards {
  const entry = pricable(plan);
  const price = (billingCycle: Exclude<BillingCycle, 'one-time'>): StorefrontPrice => ({
    charged: priceEntry(entry, { billingCycle }, tier),
    list: priceEntry(entry, { billingCycle }, listTier),
  });
  const twelveMonths = plan.monthlyListMinor * MONTHS_PER_YEAR;
  return {
    plan,
    monthly: price('monthly'),
    yearly: price('yearly'),
    // A plan priced at zero for the month would divide by zero; it is not
    // purchasable anyway, but the guard keeps the figure a number rather than
    // NaN if one is ever published.
    yearlySavingPercent:
      twelveMonths > 0 ? Math.round(((twelveMonths - plan.yearlyListMinor) / twelveMonths) * 100) : 0,
  };
}

/**
 * Every visible plan, priced on both cycles. This is what a page hands its
 * client component: figures already computed by the server that will also
 * compute the charge.
 */
export function priceStorefront(
  plans: StorefrontPlan[],
  tier: DiscountTier,
  listTier: DiscountTier
): StorefrontPlanCards[] {
  return plans.map((plan) => priceStorefrontPlan(plan, tier, listTier));
}

/** One cell of the tier-schedule table: a plan's monthly price under one tier. */
export interface TierScheduleCell {
  planId: string;
  amountMinor: number;
  currency: string;
}

/** One row of the tier-schedule table: a discount tier, priced across the plans. */
export interface TierScheduleRow {
  tierCode: string;
  cells: TierScheduleCell[];
}

/**
 * The "what each campaign costs" table on the pricing page.
 *
 * It is computed here rather than in the browser for the same reason the cards
 * are: every figure a visitor reads has to come from the published plan version
 * the server would actually charge from.
 */
export function priceTierSchedule(
  plans: StorefrontPlan[],
  tiers: readonly DiscountTier[]
): TierScheduleRow[] {
  return tiers.map((tier) => ({
    tierCode: tier.code,
    cells: plans.map((plan) => {
      const line = priceEntry(pricable(plan), { billingCycle: 'monthly' }, tier);
      return { planId: plan.planId, amountMinor: line.amountMinor, currency: line.currency };
    }),
  }));
}

/**
 * What the storefront could be read as, or an honest failure.
 *
 * `measured: false` is not the same as "no plans": a database the page could
 * not reach must render as "prices unavailable", never as an empty catalogue or
 * as the static list it was replaced by. Falling back to `catalog.ts` here
 * would quote a price the studio has since changed, which is the whole defect
 * this module exists to fix.
 */
export interface StorefrontListing {
  cards: StorefrontPlanCards[];
  /** The same plans priced across every campaign tier, for the schedule table. */
  schedule: TierScheduleRow[];
  measured: boolean;
}

export async function readStorefront(
  tenantId: string | null,
  tier: DiscountTier,
  listTier: DiscountTier,
  scheduleTiers: readonly DiscountTier[] = []
): Promise<StorefrontListing> {
  try {
    const plans = await storefrontPlans(tenantId);
    return {
      cards: priceStorefront(plans, tier, listTier),
      schedule: priceTierSchedule(plans, scheduleTiers),
      measured: true,
    };
  } catch (error) {
    // `tenantId` verbatim, including `null`. It used to log `?? 'anonymous'`,
    // which put a word in the tenant field of an observability record that
    // matches no `Tenant` row — the shape that seeded the orphan pile
    // scripts/check-orphan-alerts.ts now sweeps up. An explicit `null` is the
    // honest reading of the one case that produces it (a signed-out visitor on
    // the public list) and stays distinguishable from a field that went
    // missing, because JSON keeps the key.
    logger.error('Storefront could not be read; the page will say so rather than quote a price', error, {
      tenantId,
    });
    return { cards: [], schedule: [], measured: false };
  }
}

/**
 * Prices one requested checkout line for one tenant.
 *
 * Plans resolve against this tenant's visible set, so an unassigned private
 * plan is refused even when its sku is supplied by hand. The one-time lifetime
 * licence is not a `Plan` row and stays a catalogue line, priced exactly as
 * before.
 *
 * Nothing about the request influences the amount: `billingCycle` and
 * `quantity` say what is being bought, and every figure comes from the database
 * row plus the server's tier.
 */
export async function priceLineForTenant(
  request: { sku: string; billingCycle?: BillingCycle; quantity?: number },
  tier: DiscountTier,
  tenantId: string | null
): Promise<PricedLine> {
  // A lifetime licence is a catalogue sku, not a plan version. Resolve it first
  // so the database is not consulted for something it does not hold.
  const catalogEntry = findEntry(request.sku);
  if (catalogEntry?.kind === 'lifetime') {
    return priceLine(request, tier);
  }

  const wanted = normaliseSku(request.sku);
  if (!wanted) throw new PlanNotAvailableError(request.sku, 'unknown');

  const visible = await storefrontPlans(tenantId);
  const plan = visible.find((candidate) => candidate.planId.toLowerCase() === wanted);
  if (!plan) {
    // Distinguish "no such plan" from "not yours" for the log only. The caller
    // answers both identically.
    throw new PlanNotAvailableError(request.sku, 'not-visible');
  }

  return priceEntry(pricable(plan), { billingCycle: request.billingCycle, quantity: request.quantity }, tier);
}

/** Re-exported so callers can catch both refusals from one import. */
export { UnknownSkuError };

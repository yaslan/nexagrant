/**
 * Server-side plan catalogue — the single source of truth for what anything
 * costs. Pure: no Stripe, no Prisma, no React, no environment reads, so every
 * price in the product can be unit-tested and every caller (checkout API,
 * pricing page, admin billing, settings billing) computes the same number.
 *
 * Why this file exists: `POST /api/billing/checkout` used to compute the Stripe
 * unit amount from `price`/`originalPrice`/`discountPercent` fields sent by the
 * browser, so a caller could name its own price and buy Ultra for 50 cents.
 * Amounts now come from here and from the server's active discount tier; the
 * request may only say *which* plan, not *how much*.
 *
 * Canonical list (owner decision, 2026-09-07): the USD three-plan catalogue the
 * customer is shown today. The internal EUR five-plan list (free/starter/team/
 * business/enterprise) was retired in TASK-MTR6QIE05ZKNH; what a plan *opens*
 * now lives at the bottom of this file (`PLAN_GRANTS`), so the `Plan` table,
 * the entitlement calculation and every module manifest read one list.
 *
 * CLAUDE.md rule 9: every amount is an `Int` in the currency's minor unit
 * (cents) plus a currency code. There is no floating-point dollar in here.
 */

import { applyPercentDiscount } from '@/lib/money';

export const CATALOG_CURRENCY = 'USD';

/** Months in a yearly subscription term. */
export const MONTHS_PER_YEAR = 12;

export type BillingCycle = 'monthly' | 'yearly' | 'one-time';

export type PlanId = 'basic' | 'pro' | 'ultra';

/** What a purchasable line is: a recurring plan seat or a one-time licence. */
export type SkuKind = 'plan' | 'lifetime';

export interface PlanEntry {
  kind: 'plan';
  planId: PlanId;
  /** Stable id the client sends and the cart already uses (`plan-pro`). */
  sku: string;
  name: string;
  /**
   * List price per month on the monthly cycle, in cents.
   */
  monthlyListMinor: number;
  /**
   * List price of a full year, in cents. Derived from the advertised
   * monthly-equivalent figure × 12 and stored as that yearly total, because the
   * yearly total is what Stripe actually charges once per year — see
   * `YEARLY_DERIVATION` below.
   */
  yearlyListMinor: number;
}

export interface LifetimeEntry {
  kind: 'lifetime';
  sku: string;
  name: string;
  /** Undiscounted one-time price, in cents. */
  listMinor: number;
  /** Fixed campaign discount for this licence — not the rolling tier. */
  percentOff: number;
  /** Campaign the customer sees on the pricing page. */
  couponCode: string;
}

export type CatalogEntry = PlanEntry | LifetimeEntry;

/**
 * How a yearly price is derived, stated once so nobody re-derives it differently.
 *
 * The pricing page advertises a *monthly-equivalent* figure for the yearly
 * cycle ($32.25 / $62.25 / $99.75). Those figures times 12 are exact whole
 * dollars ($387 / $747 / $1197), so the list year has no rounding loss either
 * way. The discount is where the two orders diverge:
 *
 *   (a) round(monthlyEquivalent × (1 − d)) × 12   → Basic @70% off = 968¢ × 12 = 11616¢
 *   (b) round(monthlyEquivalent × 12 × (1 − d))   → Basic @70% off = 38700¢ × 0.30 = 11610¢
 *
 * We use (b): the year total is discounted and rounded **once**. Order (a)
 * rounds a half-cent up and then multiplies the error by twelve, overcharging
 * 6¢ a year on every plan at every half-cent tier — small, but it is money
 * taken from the customer by a rounding artefact, and Stripe charges the yearly
 * amount as a single unit, so the yearly figure is the one that has to be a
 * whole cent. The monthly-equivalent stays a display figure
 * (`monthlyEquivalentMinor`) and may differ from `amountMinor / 12` by under a
 * cent; never charge it.
 */
export const YEARLY_DERIVATION = 'discount-once-on-yearly-total' as const;

const PLANS: readonly PlanEntry[] = [
  {
    kind: 'plan',
    planId: 'basic',
    sku: 'plan-basic',
    name: 'Basic',
    monthlyListMinor: 4_500, // $45.00 / month
    yearlyListMinor: 38_700, // $32.25 × 12 = $387.00 / year
  },
  {
    kind: 'plan',
    planId: 'pro',
    sku: 'plan-pro',
    name: 'Pro',
    monthlyListMinor: 8_700, // $87.00 / month
    yearlyListMinor: 74_700, // $62.25 × 12 = $747.00 / year
  },
  {
    kind: 'plan',
    planId: 'ultra',
    sku: 'plan-ultra',
    name: 'Ultra',
    monthlyListMinor: 14_700, // $147.00 / month
    yearlyListMinor: 119_700, // $99.75 × 12 = $1,197.00 / year
  },
];

const LIFETIME: readonly LifetimeEntry[] = [
  {
    kind: 'lifetime',
    sku: 'lifetime-ultra',
    name: 'Ultra Lifetime',
    listMinor: 257_600, // $2,576.00 list
    percentOff: 50, //     → $1,288.00 charged
    couponCode: 'OMURBOYU20',
  },
];

/**
 * How many lifetime licences the offer is limited to. Catalogue data, not
 * pricing logic: the marketing copy promises "the first 20 companies", and
 * `src/lib/billing/lifetime-licence.ts` compares it against the number of
 * `LifetimeLicence` rows so the pricing badge can stop inventing one.
 */
export const LIFETIME_LICENCE_CAP = 20;

export const CATALOG: readonly CatalogEntry[] = [...PLANS, ...LIFETIME];

/**
 * Rolling early-bird discount tiers. `percentOff` is the only price authority
 * a campaign has; a coupon code names the campaign, it does not carry a rate.
 *
 * `cumulativeSubscribers` is the paying-subscriber count at which the tier is
 * exhausted (first 5, then 10 more, then 20 more…). It is here so that the day
 * the subscriber count becomes a trustworthy business fact, `tierForSubscriberCount`
 * can drive the active tier without anyone re-typing the ladder. It does not do
 * so today — see `src/lib/billing/active-tier.ts` for why.
 */
export interface DiscountTier {
  code: string;
  percentOff: number;
  /** 1 = earliest / deepest discount. */
  rank: number;
  cumulativeSubscribers: number;
}

export const DISCOUNT_TIERS: readonly DiscountTier[] = [
  { code: 'ILK5', percentOff: 70, rank: 1, cumulativeSubscribers: 5 },
  { code: 'SONRAKI10', percentOff: 60, rank: 2, cumulativeSubscribers: 15 },
  { code: 'LANSMAN50', percentOff: 50, rank: 3, cumulativeSubscribers: 35 },
  { code: 'KURUCU40', percentOff: 40, rank: 4, cumulativeSubscribers: 85 },
  { code: 'GROWTH30', percentOff: 30, rank: 5, cumulativeSubscribers: 185 },
  { code: 'SCALE20', percentOff: 20, rank: 6, cumulativeSubscribers: 385 },
  { code: 'PROMO10', percentOff: 10, rank: 7, cumulativeSubscribers: 885 },
];

/** The tier used when no campaign is running: list price, no discount. */
export const NO_DISCOUNT_TIER: DiscountTier = {
  code: 'NONE',
  percentOff: 0,
  rank: 99,
  cumulativeSubscribers: Number.MAX_SAFE_INTEGER,
};

export function findTierByCode(code: string | null | undefined): DiscountTier | null {
  if (!code) return null;
  const wanted = code.trim().toUpperCase();
  if (wanted === NO_DISCOUNT_TIER.code) return NO_DISCOUNT_TIER;
  return DISCOUNT_TIERS.find((tier) => tier.code === wanted) ?? null;
}

/**
 * Which tier a given number of paying subscribers falls in. Past the last tier
 * the campaign is over and the list price applies — never a wrap-around back to
 * the deepest discount.
 */
export function tierForSubscriberCount(count: number): DiscountTier {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Subscriber count must be a non-negative integer, got ${count}`);
  }
  return DISCOUNT_TIERS.find((tier) => count < tier.cumulativeSubscribers) ?? NO_DISCOUNT_TIER;
}

export function findEntry(skuOrPlanId: string): CatalogEntry | null {
  const wanted = skuOrPlanId.trim().toLowerCase();
  return (
    CATALOG.find((entry) => entry.sku === wanted) ??
    CATALOG.find((entry) => entry.kind === 'plan' && entry.planId === wanted) ??
    null
  );
}

export interface PricedLine {
  sku: string;
  name: string;
  kind: SkuKind;
  billingCycle: BillingCycle;
  /** What is charged per unit, in minor units. Integer, always. */
  amountMinor: number;
  /** The undiscounted per-unit price, for "was $X" display. */
  listAmountMinor: number;
  currency: string;
  /** The discount actually applied, in whole percent. */
  percentOff: number;
  /** Campaign this line was priced under (tier code, or the lifetime coupon). */
  campaignCode: string;
  quantity: number;
  /** Line total = amountMinor × quantity. */
  totalMinor: number;
  /**
   * Display-only monthly figure for a yearly line (`amountMinor / 12`, rounded).
   * Never send this to a payment provider.
   */
  monthlyEquivalentMinor: number;
  /** Stripe recurring interval, absent for one-time licences. */
  recurringInterval: 'month' | 'year' | null;
}

export interface PriceRequest {
  /** `plan-pro`, `pro`, or `lifetime-ultra`. */
  sku: string;
  /** Ignored for a lifetime licence, which is always one-time. */
  billingCycle?: BillingCycle;
  quantity?: number;
}

export class UnknownSkuError extends Error {
  constructor(public readonly sku: string) {
    super(`Unknown catalogue sku: ${sku}`);
    this.name = 'UnknownSkuError';
  }
}

export class UnsupportedCycleError extends Error {
  constructor(public readonly sku: string, public readonly billingCycle: string) {
    super(`Sku ${sku} cannot be billed ${billingCycle}`);
    this.name = 'UnsupportedCycleError';
  }
}

/**
 * Prices one catalogue line under a server-chosen tier. This is the only
 * function allowed to produce an amount that reaches a payment provider.
 */
export function priceLine(request: PriceRequest, tier: DiscountTier): PricedLine {
  const entry = findEntry(request.sku);
  if (!entry) throw new UnknownSkuError(request.sku);

  const quantity = request.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Quantity must be a positive integer, got ${request.quantity}`);
  }

  if (entry.kind === 'lifetime') {
    if (request.billingCycle && request.billingCycle !== 'one-time') {
      throw new UnsupportedCycleError(entry.sku, request.billingCycle);
    }
    // A lifetime licence carries its own fixed campaign discount; the rolling
    // early-bird tier does not stack on top of it.
    const amountMinor = applyPercentDiscount(entry.listMinor, entry.percentOff);
    return {
      sku: entry.sku,
      name: entry.name,
      kind: 'lifetime',
      billingCycle: 'one-time',
      amountMinor,
      listAmountMinor: entry.listMinor,
      currency: CATALOG_CURRENCY,
      percentOff: entry.percentOff,
      campaignCode: entry.couponCode,
      quantity,
      totalMinor: amountMinor * quantity,
      monthlyEquivalentMinor: amountMinor,
      recurringInterval: null,
    };
  }

  const billingCycle = request.billingCycle ?? 'monthly';
  if (billingCycle === 'one-time') {
    throw new UnsupportedCycleError(entry.sku, billingCycle);
  }

  const listAmountMinor = billingCycle === 'yearly' ? entry.yearlyListMinor : entry.monthlyListMinor;
  const amountMinor = applyPercentDiscount(listAmountMinor, tier.percentOff);

  return {
    sku: entry.sku,
    name: entry.name,
    kind: 'plan',
    billingCycle,
    amountMinor,
    listAmountMinor,
    currency: CATALOG_CURRENCY,
    percentOff: tier.percentOff,
    campaignCode: tier.code,
    quantity,
    totalMinor: amountMinor * quantity,
    monthlyEquivalentMinor:
      billingCycle === 'yearly' ? Math.round(amountMinor / MONTHS_PER_YEAR) : amountMinor,
    recurringInterval: billingCycle === 'yearly' ? 'year' : 'month',
  };
}

// ─────────────────────── Entitlements: what a plan opens ───────────────────────
//
// TASK-MTR6QIE05ZKNH. Until now the product knew two plan ladders: the USD one
// above, which is what a customer is actually shown and charged, and an
// internal EUR one (`free/starter/team/business/enterprise`) that decided which
// modules, seats, workspaces and AI credits a tenant got. Authorisation
// therefore did not recognise the thing the customer had bought.
//
// The USD ladder wins (owner decision, 2026-09-07). Everything below is the
// *entitlement* half of the catalogue: no prices, no discounting, nothing that
// touches `priceLine`. `prisma/seed.ts` writes the `Plan` table from it,
// `src/lib/billing.ts` computes entitlements from it, and each module manifest
// derives its `planTiers` from it, so the fact "Ultra opens M6" is typed once.

/**
 * The plan a tenant is on when it has no active subscription.
 *
 * It is not for sale — it never appears in `CATALOG`, so no pricing panel can
 * render it — but it must exist as a `Plan` row, because `getEntitlements`
 * falls back to it for every tenant without a live subscription.
 */
export const FALLBACK_PLAN_ID = 'free';

export type EntitlementPlanId = PlanId | typeof FALLBACK_PLAN_ID;

export interface PlanGrant {
  planId: EntitlementPlanId;
  name: string;
  /** False for `free`: a state a tenant falls into, not a thing it can buy. */
  purchasable: boolean;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  /** Modules switched on by the plan itself, before any add-on. */
  moduleIds: readonly string[];
}

const ALL_MODULE_IDS = [
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
  'M9',
  'M10',
  'M11',
] as const;

export const PLAN_GRANTS: readonly PlanGrant[] = [
  {
    planId: 'free',
    name: 'Discover',
    purchasable: false,
    seats: 1,
    workspaces: 1,
    aiCreditsMonthly: 10,
    moduleIds: ['M3', 'M5'],
  },
  {
    planId: 'basic',
    name: 'Basic',
    purchasable: true,
    seats: 2,
    workspaces: 1,
    aiCreditsMonthly: 100,
    moduleIds: ['M2', 'M3', 'M5'],
  },
  {
    planId: 'pro',
    name: 'Pro',
    purchasable: true,
    seats: 6,
    workspaces: 1,
    aiCreditsMonthly: 500,
    moduleIds: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'],
  },
  {
    planId: 'ultra',
    name: 'Ultra',
    purchasable: true,
    seats: 15,
    workspaces: 5,
    aiCreditsMonthly: 2_000,
    moduleIds: ALL_MODULE_IDS,
  },
];

/**
 * Retired EUR plan id → the USD plan that replaces it.
 *
 * The rule the mapping obeys is *no capability may be taken away*: each target
 * grants a superset of the source's modules, and where the source granted more
 * seats or workspaces than the target (only `enterprise` did), the migration
 * preserves the difference on `Subscription.seatsExtra` / `workspacesExtra`
 * rather than shrinking the tenant. The rationale per row is in
 * docs/BILLING.md §9.
 */
export const RETIRED_PLAN_IDS: Readonly<Record<string, EntitlementPlanId>> = {
  starter: 'basic',
  team: 'pro',
  business: 'ultra',
  enterprise: 'ultra',
};

export function grantsFor(planId: string): PlanGrant | null {
  const wanted = resolvePlanId(planId);
  return PLAN_GRANTS.find((grant) => grant.planId === wanted) ?? null;
}

/**
 * Normalises any plan id the database or a stale payload may still carry.
 * A retired id resolves to its replacement; an unknown id is returned
 * unchanged so the caller can fail loudly rather than silently entitle.
 */
export function resolvePlanId(planId: string): string {
  const wanted = planId.trim().toLowerCase();
  return RETIRED_PLAN_IDS[wanted] ?? wanted;
}

/**
 * Which purchasable plans open a module — the value each module manifest puts
 * in `planTiers`, derived here so the grant is stated once.
 *
 * `free` is deliberately excluded: a manifest's `planTiers` has never listed
 * the free tier, and `canEnable` uses it as "which plan do you have to buy",
 * so adding it here would change module gating rather than move it.
 */
export function plansGrantingModule(moduleId: string): PlanId[] {
  return PLAN_GRANTS.filter(
    (grant) => grant.purchasable && grant.moduleIds.includes(moduleId)
  ).map((grant) => grant.planId as PlanId);
}

/**
 * The same grant, as the names a customer recognises ("Pro", "Ultra") rather
 * than the ids the code speaks in. Read-only helper for the module gate's
 * refusal copy: telling somebody "upgrade to `ultra`" leaks an internal id, and
 * having the gate hand-map ids to names would put a second copy of the ladder
 * outside this file.
 */
export function planNamesGrantingModule(moduleId: string): string[] {
  return plansGrantingModule(moduleId).map((planId) => grantsFor(planId)?.name ?? planId);
}

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

/**
 * Everything `priceEntry` needs to price a recurring plan line.
 *
 * Split out of `PlanEntry` so that a published `PlanVersion` row — a plan the
 * studio wrote, whose id is not one of the three literals in `PlanId` — can be
 * priced by the same function rather than by a second copy of the arithmetic.
 * See `src/lib/billing/storefront.ts`.
 */
export interface PricablePlan {
  kind: 'plan';
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
  /**
   * Currency of the two figures above. Absent on the static entries below,
   * which are all `CATALOG_CURRENCY`; a database plan carries its own, because
   * `PlanVersion.currency` is a column the studio can set.
   */
  currency?: string;
}

export interface PlanEntry extends PricablePlan {
  planId: PlanId;
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
  return priceEntry(entry, request, tier);
}

/**
 * The arithmetic half of `priceLine`, over an entry the caller has already
 * resolved.
 *
 * It is exported because the storefront now resolves plans from the database
 * (`PlanVersion`, written by the plan studio) rather than from the `PLANS`
 * array above, and a second implementation of "list price → discounted amount →
 * line total" is exactly how the two would drift into quoting different
 * numbers. `src/lib/billing/storefront.ts` shapes a published version into a
 * `PlanEntry` and prices it here, so there is still one rounding rule
 * (`YEARLY_DERIVATION`) and one place that can produce a charge.
 */
export function priceEntry(
  entry: PricablePlan | LifetimeEntry,
  request: Omit<PriceRequest, 'sku'>,
  tier: DiscountTier
): PricedLine {
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
    currency: entry.currency ?? CATALOG_CURRENCY,
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

/** FB KAMU B11 — the three public-sector packages, sold by contract only. */
export type PublicSectorPlanId = 'public-starter' | 'public-team' | 'public-institution';

/**
 * FO-41 (F3) — the TTO Edition: a package a technology transfer office is
 * offered by agreement. Like the public-sector packages it is never on the
 * shopfront (`purchasable: false`, no `CATALOG` price); unlike them it is not a
 * copy of a self-serve plan, so it is a grant of its own.
 */
export const TTO_EDITION_PLAN_ID = 'tto-edition';

export type EntitlementPlanId =
  | PlanId
  | typeof FALLBACK_PLAN_ID
  | typeof TTO_EDITION_PLAN_ID
  | PublicSectorPlanId;

/**
 * How a plan narrows a module it grants (FO-41). Absent means the module is
 * granted in full. Read through `moduleLimitsFor`; the gate turns `readOnly`
 * into a `READ_ONLY_PLAN` refusal on writes (`assertModuleWrite`) and the M1
 * search page meters `partnerSearchPerMonth` in `PartnerSearchQuotaUsage`.
 */
export interface ModuleLimits {
  /** Partner searches (a search with at least one criterion) per UTC month. */
  partnerSearchPerMonth?: number;
  /** Nothing may be created or changed in the module; reading is allowed. */
  readOnly?: boolean;
}

export interface PlanGrant {
  planId: EntitlementPlanId;
  name: string;
  /**
   * True only for a plan a tenant can buy by itself at checkout. False for
   * `free` (a state a tenant falls into) and for the public-sector packages
   * (sold by contract, assigned by a platform admin — see
   * `PUBLIC_SECTOR_PLANS`).
   */
  purchasable: boolean;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  /** Modules switched on by the plan itself, before any add-on. */
  moduleIds: readonly string[];
  /**
   * Modules a card lists this plan as including, but which do not grant access
   * yet (`statusBadge: 'soon'`). Read only by `displayPlansForModule`; never by
   * `plansGrantingModule`, `PLAN_GRANTS` access or the module gate.
   */
  previewModuleIds?: readonly string[];
  /**
   * Modules in `moduleIds` that this plan grants only in a limited form. A
   * module listed here is still granted (it is in `allowedModules`); the limit
   * is what the module does with it.
   */
  moduleLimits?: Readonly<Record<string, ModuleLimits>>;
  /**
   * Metered capabilities, keyed by the `limitKey` a plan card's
   * `PlanFeature` row names (see {@link PLAN_LIMIT_KEYS}). A missing key means
   * the plan states no limit for it: read through the helper of that limit,
   * never directly, because "missing" means different things per limit.
   */
  limits?: PlanLimits;
}

/**
 * The `limitKey` values this catalogue defines. `PlanFeature.limitKey` (kind
 * `limit`) points at one of these, so a card bullet and the gate read the
 * same key.
 */
export const PLAN_LIMIT_KEYS = {
  /** Partner Search list queries per tenant per UTC month (FO-61). */
  partnerSearchQueriesMonthly: 'partner_search_queries_monthly',
  /** Partner Search JSON/CSV export (FO-61). */
  partnerSearchExport: 'partner_search_export',
} as const;

export interface PlanLimits {
  /**
   * On a plan **with** M1 a missing value means unlimited; a number meters it.
   * On a plan **without** M1 a positive number opens Partner Search announcements
   * (and only those, not the rest of M1) up to that many list queries a month.
   */
  readonly partner_search_queries_monthly?: number;
  /** True opens the export; missing means no export. Requires M1. */
  readonly partner_search_export?: boolean;
}

/**
 * The limited Partner Intelligence (M1) of FO-41: ten searches a month, read
 * only. One constant, so Discover, Basic and the TTO Edition cannot drift.
 */
const M1_LIMITED: ModuleLimits = { partnerSearchPerMonth: 10, readOnly: true };

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

const SELF_SERVE_GRANTS: readonly PlanGrant[] = [
  {
    planId: 'free',
    name: 'Discover',
    purchasable: false,
    seats: 1,
    workspaces: 1,
    aiCreditsMonthly: 10,
    // FO-41 (F3): M3 moved to Basic; Discover opens a limited M1 instead. M0
    // stays a preview while it is `statusBadge: 'soon'`. Tenants that already
    // run M3 here keep it through `ModuleState.grandfathered`.
    moduleIds: ['M1', 'M5'],
    previewModuleIds: ['M0', 'M12', 'M16'],
    moduleLimits: { M1: M1_LIMITED },
    limits: { partner_search_queries_monthly: M1_LIMITED.partnerSearchPerMonth },
  },
  {
    planId: 'basic',
    name: 'Basic',
    purchasable: true,
    seats: 2,
    workspaces: 1,
    aiCreditsMonthly: 100,
    // Limited M1 as on Discover: upgrading must not take a module away.
    moduleIds: ['M1', 'M2', 'M3', 'M5'],
    previewModuleIds: ['M0', 'M12', 'M16'],
    moduleLimits: { M1: M1_LIMITED },
    limits: { partner_search_queries_monthly: M1_LIMITED.partnerSearchPerMonth },
  },
  {
    planId: 'pro',
    name: 'Pro',
    purchasable: true,
    seats: 6,
    workspaces: 1,
    aiCreditsMonthly: 500,
    // M17 Interreg pre-assessment: "Pro and above" (FO-185); open since its screen
    // shipped (FO-189).
    moduleIds: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M17'],
    previewModuleIds: ['M0', 'M12', 'M13', 'M16'],
  },
  {
    planId: 'ultra',
    name: 'Ultra',
    purchasable: true,
    seats: 15,
    workspaces: 5,
    aiCreditsMonthly: 2_000,
    moduleIds: [...ALL_MODULE_IDS, 'M17'],
    previewModuleIds: ['M0', 'M12', 'M13', 'M14', 'M15', 'M16'],
    limits: { partner_search_export: true },
  },
];

// ─────────────────────── Public-sector packages (FB KAMU B11) ───────────────────────
//
// Owner-approved on 2026-09-29 (docs/kamu/ILKADIM-PILOT.md §6.2). A
// municipality buys a year by contract under 4734 md. 22/d, so these plans are
// never on the shopfront and never reach Stripe or iyzico: a platform admin
// assigns one to a tenant in /admin/billing/plans, which writes the tenant's
// `Subscription` (`assignPlanToTenant`). No invoice is issued from here — that
// waits for e-Fatura (TASK-MTRJSOWFH6B45).
//
// Each package opens exactly what its base plan opens ("Başlangıç / Ekip /
// İşletme planı yetkileri" in §6.2, which are `basic` / `pro` / `ultra` since
// the EUR ladder was retired — see `RETIRED_PLAN_IDS`). The grant is derived
// from the base plan rather than re-typed, so the two cannot drift; only the
// seat count is stated here, because it is part of what the contract sells.

/** Currency every public-sector package is contracted in. */
export const PUBLIC_SECTOR_CURRENCY = 'TRY';

/** How often the package includes a written usage report. */
export type ReportCadence = 'quarterly' | 'monthly';

/**
 * The service half of a contract — delivered by people, recorded here as plan
 * metadata so a proposal and the product quote the same terms. Nothing
 * schedules or counts these days automatically.
 */
export interface PublicSectorServiceTerms {
  /** Onboarding days on site or online (Başlangıç, Ekip). */
  onboardingDays: number;
  /** Training days (Kurum). */
  trainingDays: number;
  /** Written usage report, or `null` when the package has none. */
  reportCadence: ReportCadence | null;
}

export interface PublicSectorPlan {
  planId: PublicSectorPlanId;
  name: string;
  /** The self-serve plan whose modules, workspaces and credits this opens. */
  basePlanId: PlanId;
  seats: number;
  /** Price of one contract year, VAT excluded, in kuruş (CLAUDE.md rule 9). */
  yearlyListMinor: number;
  currency: typeof PUBLIC_SECTOR_CURRENCY;
  services: PublicSectorServiceTerms;
}

export const PUBLIC_SECTOR_PLANS: readonly PublicSectorPlan[] = [
  {
    planId: 'public-starter',
    name: 'Belediye Başlangıç',
    basePlanId: 'basic',
    seats: 2,
    yearlyListMinor: 9_000_000, // 90.000,00 TL / year, VAT excluded
    currency: PUBLIC_SECTOR_CURRENCY,
    services: { onboardingDays: 1, trainingDays: 0, reportCadence: null },
  },
  {
    planId: 'public-team',
    name: 'Belediye Ekip',
    basePlanId: 'pro',
    seats: 6,
    yearlyListMinor: 24_000_000, // 240.000,00 TL / year, VAT excluded
    currency: PUBLIC_SECTOR_CURRENCY,
    services: { onboardingDays: 2, trainingDays: 0, reportCadence: 'quarterly' },
  },
  {
    planId: 'public-institution',
    name: 'Belediye Kurum',
    basePlanId: 'ultra',
    seats: 15,
    yearlyListMinor: 48_000_000, // 480.000,00 TL / year, VAT excluded
    currency: PUBLIC_SECTOR_CURRENCY,
    services: { onboardingDays: 0, trainingDays: 4, reportCadence: 'monthly' },
  },
];

/** The public-sector package with this id, or `null` for any other plan. */
export function publicSectorPlan(planId: string): PublicSectorPlan | null {
  const wanted = planId.trim().toLowerCase();
  return PUBLIC_SECTOR_PLANS.find((plan) => plan.planId === wanted) ?? null;
}

/** True for a plan sold by contract and assigned by an admin, never at checkout. */
export function isContractPlan(planId: string): boolean {
  return publicSectorPlan(planId) !== null;
}

function publicSectorGrant(plan: PublicSectorPlan): PlanGrant {
  const base = SELF_SERVE_GRANTS.find((grant) => grant.planId === plan.basePlanId);
  if (!base) throw new Error(`Public-sector plan ${plan.planId} names unknown base ${plan.basePlanId}`);
  // The contract terms (ILKADIM-PILOT.md §6.2) predate FO-41 and name modules in
  // full only: a module the base grants limited (Basic's M1) is not part of them.
  const { moduleLimits: baseLimits = {}, ...rest } = base;
  return {
    ...rest,
    moduleIds: base.moduleIds.filter((id) => !(id in baseLimits)),
    planId: plan.planId,
    name: plan.name,
    purchasable: false,
    seats: plan.seats,
  };
}

/**
 * FO-41: limited M1, M4 and M7. No price anywhere (`CATALOG` has no entry), so
 * neither checkout nor `getAllPlans` can offer it; seats and credits follow
 * Basic until an agreement states otherwise.
 */
const TTO_EDITION_GRANT: PlanGrant = {
  planId: TTO_EDITION_PLAN_ID,
  name: 'TTO Edition',
  purchasable: false,
  seats: 2,
  workspaces: 1,
  aiCreditsMonthly: 100,
  moduleIds: ['M1', 'M4', 'M7'],
  moduleLimits: { M1: M1_LIMITED },
};

export const PLAN_GRANTS: readonly PlanGrant[] = [
  ...SELF_SERVE_GRANTS,
  TTO_EDITION_GRANT,
  ...PUBLIC_SECTOR_PLANS.map(publicSectorGrant),
];

/** The limits a plan puts on one module it grants; `null` when granted in full. */
export function moduleLimitsFor(planId: string, moduleId: string): ModuleLimits | null {
  return grantsFor(planId)?.moduleLimits?.[moduleId] ?? null;
}

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

/** What a plan grants of Partner Search beyond the M1 switch (FO-61). */
export interface PartnerSearchGrant {
  /** Monthly list-query allowance; null = unlimited (only ever with M1). */
  queriesMonthly: number | null;
  export: boolean;
}

/**
 * Partner Search terms of `planId`, from {@link PlanLimits}. `hasM1` is the
 * tenant's M1 entitlement (plan plus add-ons, from `getEntitlements`); it
 * decides what a plan that states **no** figure means: unlimited with M1,
 * nothing without it. A plan that states a figure is metered either way, so an
 * M1 add-on on Basic keeps Basic's monthly cap (docs/BILLING.md). The figure
 * itself is never typed anywhere else. A limited M1 (`moduleLimits`, FO-41)
 * meters the same month, so a plan that grants M1 only in that form (TTO
 * Edition) is capped here too, not granted unlimited.
 */
export function partnerSearchGrant(planId: string, hasM1: boolean): PartnerSearchGrant {
  const limits = grantsFor(planId)?.limits ?? {};
  const metered =
    limits.partner_search_queries_monthly ?? moduleLimitsFor(planId, 'M1')?.partnerSearchPerMonth;
  return {
    queriesMonthly: typeof metered === 'number' ? metered : hasM1 ? null : 0,
    export: hasM1 && limits.partner_search_export === true,
  };
}

/** Plan names whose card would open the Partner Search export, for an upgrade prompt. */
export function planNamesGrantingPartnerSearchExport(): string[] {
  return SELF_SERVE_GRANTS.filter((grant) => grant.purchasable && grant.limits?.partner_search_export === true).map(
    (grant) => grant.name
  );
}

/** The plans a module card lists: the free tier plus the three self-serve plans. */
export type DisplayPlanId = PlanId | typeof FALLBACK_PLAN_ID;

/**
 * Which plans to *show* on a module card as including it — read-only, for
 * display. Unlike `plansGrantingModule` this keeps `free` (Discover), because a
 * customer comparing plans should see that Discover already includes M3 and M5;
 * gating keeps using `plansGrantingModule`, so nothing here changes who can
 * switch a module on. Contract-only public-sector packages are left out: they
 * are not on the shopfront the card points at.
 */
export function displayPlansForModule(moduleId: string): DisplayPlanId[] {
  return SELF_SERVE_GRANTS.filter(
    (grant) =>
      grant.moduleIds.includes(moduleId) || (grant.previewModuleIds ?? []).includes(moduleId)
  ).map((grant) => grant.planId as DisplayPlanId);
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

/**
 * The purchasable plans that open a module with no limit — what a
 * `READ_ONLY_PLAN` refusal tells the tenant to buy (Basic's limited M1 is not
 * an answer to "I need to write").
 */
export function planNamesGrantingModuleInFull(moduleId: string): string[] {
  return plansGrantingModule(moduleId)
    .filter((planId) => moduleLimitsFor(planId, moduleId) === null)
    .map((planId) => grantsFor(planId)?.name ?? planId);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI credit cost per action
//
// TASK-MTSXGXBCJ007W, owner decision "option C": what a tenant is charged for an
// AI action is the figure docs/BILLING.md §1 *sells*, not a figure derived from
// token counts.
//
// Before this, the price was computed from tokens — `max(1, ceil((in+out)/10K))`
// — which meant the published table ("M6 değerlendirme 3 kredi") was marketing
// copy that no code implemented. Two long M9 briefs could cost 1 credit and 2 on
// consecutive days for the same button, and nothing a customer could read told
// them which. CLAUDE.md rule 7: a number shown to a user must come from a
// record, not from arithmetic invented in the code path.
//
// Token counts are still written to every `AiUsageLog` row. They are simply not
// what the ledger moves by today; keeping them means a usage-based coefficient
// can be introduced later against real history rather than from zero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a figure below is one the customer has actually been shown.
 *
 * `published` — printed in docs/BILLING.md §1. Changing it is a price change.
 * `pending-owner-approval` — proposed by the lead, not yet sold to anyone, and
 *   deliberately visible as such so it cannot silently harden into a price.
 */
export type AiCreditApproval = 'published' | 'pending-owner-approval';

export interface AiCreditEntry {
  /** Credits the ledger moves by for one successful action. */
  credits: number;
  approval: AiCreditApproval;
  /** Why this figure — one line, read by whoever revisits the decision. */
  note: string;
}

/**
 * The one credit table.
 *
 * Keys are either a module id (`M6`) or a module-and-purpose pair (`M6:esr-parser`).
 * The pair wins when present. Two production call sites build their `purpose`
 * from data — M2 sends `Drafting section: ${key}`, M10 sends
 * `document_generation_${kind}` — so a purpose-only table could never have
 * covered them; the module row is what prices those, exactly as §1 prices them
 * ("M2 taslak 1", "M10 belge 1") without naming a section or a document kind.
 */
export const AI_ACTION_CREDITS: Readonly<Record<string, AiCreditEntry>> = {
  // ── Published in docs/BILLING.md §1. These are sold figures. ──────────────
  M1: { credits: 1, approval: 'published', note: 'Profil özeti — BILLING.md §1.' },
  M2: { credits: 1, approval: 'published', note: 'Taslak bölüm / kavram notu — BILLING.md §1.' },
  M3: { credits: 1, approval: 'published', note: 'Kaynak özeti — BILLING.md §1.' },
  M6: { credits: 3, approval: 'published', note: 'Değerlendirme — BILLING.md §1; the most expensive action in the product.' },
  M9: { credits: 1, approval: 'published', note: 'Brifing — BILLING.md §1.' },
  M10: { credits: 1, approval: 'published', note: 'Belge üretimi — BILLING.md §1.' },
  M11: { credits: 2, approval: 'published', note: 'Bölüm — BILLING.md §1.' },

  // ── NOT published. Lead proposal, awaiting owner sign-off. ────────────────
  // Both are live production call sites, so they had to be priced at *some*
  // number for the call to be chargeable at all. These are the lead's, and they
  // are marked so nobody mistakes them for a figure a customer agreed to. Each
  // is a one-line change once the owner rules.
  M7: {
    credits: 1,
    approval: 'pending-owner-approval',
    note:
      'TTO/IP checklist. Proposed 1 by parity: M9 (brifing) and M10 (belge) are 1, ' +
      'and M7 is the same shape — one click, one generated document.',
  },
  'M17:evaluate': {
    credits: 3,
    approval: 'pending-owner-approval',
    note:
      'Interreg pre-assessment (FO-188). Proposed 3 = the M6 evaluation class: the FO-185 ' +
      'plan the owner approved says "kredi fiyatı M6 değerlendirmesiyle aynı sınıfta başlar", ' +
      'and it is the same shape — a whole application read against an official grid. ' +
      'Charged once, as one ledger row, in the same transaction as the result; the model calls ' +
      'themselves are priced 0 (evaluate-attempt, evaluate-retry), so a failed run costs nothing.',
  },
  'M17:evaluate-attempt': {
    credits: 0,
    approval: 'pending-owner-approval',
    note:
      'The first model call of an M17:evaluate run (FO-188). Priced 0: the price is taken once, ' +
      'after the result is saved, under M17:evaluate. The call is still logged in AiUsageLog.',
  },
  'M17:evaluate-retry': {
    credits: 0,
    approval: 'pending-owner-approval',
    note:
      'The one re-ask after an answer that failed the output schema (FO-188). Priced 0: the ' +
      'user pressed one button and pays M17:evaluate only when a result is delivered; a malformed ' +
      'answer is our defect, not a second purchase. The call is still logged in AiUsageLog.',
  },
  'M6:esr-parser': {
    credits: 0,
    approval: 'pending-owner-approval',
    note:
      'ESR score extraction. Proposed 0 because it has no production caller today ' +
      '(only tests/modules/esr-parser.test.ts reaches it); when it is wired up it ' +
      'becomes a sub-step of the M6 evaluation, which already charges 3. Charging ' +
      'here as well would bill one user action twice.',
  },
};

/**
 * The credit entry for an action, or `null` when the action has no price.
 *
 * `null` is not "free" — see `creditsForUsage` in src/lib/llm.ts, which refuses
 * the call. An action nobody has priced must not reach a provider on the
 * house.
 */
export function aiCreditEntry(module: string, purpose: string): AiCreditEntry | null {
  return AI_ACTION_CREDITS[`${module}:${purpose}`] ?? AI_ACTION_CREDITS[module] ?? null;
}

/**
 * NexaGrant plan × feature matrix and price offers — pure functions over catalogue rows
 * (NG-57). The rows come from the database (`repository.ts`); nothing here knows a
 * number. Unit-tested without a database.
 */
import {
  isNgCurrency,
  isNgFeatureKey,
  isNgInterval,
  type NgCurrency,
  type NgFeatureKey,
  type NgInterval,
} from './features';

/** One `NgPlan` row, as much of it as the decisions here need. */
export interface NgPlanRow {
  id: string;
  tier: string;
  sortOrder: number;
  /** The plan is meant to be bought at all (free and enterprise are not). */
  sellable: boolean;
  /** The plan a tenant without a NexaGrant subscription — or past its trial — is on. */
  isFallback: boolean;
}

/** One cell of the matrix: the plan grants the feature; `limitValue` meters it (null = unlimited). */
export interface NgPlanFeatureRow {
  planId: string;
  featureKey: string;
  limitValue: number | null;
}

/** One price cell. `amountMinor` null = not priced yet (waits on the accountant): not purchasable. */
export interface NgPlanPriceRow {
  planId: string;
  currency: string;
  interval: string;
  amountMinor: number | null;
}

/** What a plan grants: feature → limit (null = unlimited). A feature that is absent is not granted. */
export interface NgEntitlement {
  planId: string;
  features: ReadonlyMap<NgFeatureKey, number | null>;
}

/**
 * The entitlement of `planId` from the matrix rows. Rows of other plans are ignored; a
 * row naming a feature key this code does not know is ignored too (it grants nothing —
 * fail closed, never a guess).
 */
export function entitlementFor(planId: string, rows: readonly NgPlanFeatureRow[]): NgEntitlement {
  const features = new Map<NgFeatureKey, number | null>();
  for (const row of rows) {
    if (row.planId !== planId || !isNgFeatureKey(row.featureKey)) continue;
    features.set(row.featureKey, row.limitValue);
  }
  return { planId, features };
}

/** The set of granted feature keys, the shape `can()` takes. */
export function grantedFeatures(entitlement: NgEntitlement): ReadonlySet<string> {
  return new Set(entitlement.features.keys());
}

export type NgFeatureLimit = { granted: false } | { granted: true; limit: number | null };

/** Is `feature` granted, and with which limit (null = unlimited)? */
export function featureLimit(entitlement: NgEntitlement, feature: NgFeatureKey): NgFeatureLimit {
  if (!entitlement.features.has(feature)) return { granted: false };
  return { granted: true, limit: entitlement.features.get(feature) ?? null };
}

export interface NgPriceOffer {
  currency: NgCurrency;
  interval: NgInterval;
  /** Minor units (kuruş / cent). Null until the price is entered. */
  amountMinor: number | null;
  /** True only for a sellable plan with a positive amount in this currency and interval. */
  purchasable: boolean;
}

/**
 * The price offers of one plan, one per (currency, interval) row. A currency outside
 * TRY/EUR (K-584156) is dropped, not shown.
 */
export function priceOffersFor(plan: NgPlanRow, prices: readonly NgPlanPriceRow[]): NgPriceOffer[] {
  const offers: NgPriceOffer[] = [];
  for (const row of prices) {
    if (row.planId !== plan.id || !isNgCurrency(row.currency) || !isNgInterval(row.interval)) continue;
    const priced = row.amountMinor !== null && Number.isInteger(row.amountMinor) && row.amountMinor > 0;
    offers.push({
      currency: row.currency,
      interval: row.interval,
      amountMinor: row.amountMinor,
      purchasable: plan.sellable && priced,
    });
  }
  return offers;
}

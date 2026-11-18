/**
 * NexaGrant plan × feature matrix and price offers — pure functions over catalogue rows
 * (NG-57). The rows come from the database (`repository.ts`); nothing here knows a
 * number. Unit-tested without a database.
 */
import {
  isNgCurrency,
  isNgFeatureKey,
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
  void planId;
  void rows;
  throw new Error('NG-57: entitlementFor not implemented');
}

/** The set of granted feature keys, the shape `can()` takes. */
export function grantedFeatures(entitlement: NgEntitlement): ReadonlySet<string> {
  void entitlement;
  throw new Error('NG-57: grantedFeatures not implemented');
}

export type NgFeatureLimit = { granted: false } | { granted: true; limit: number | null };

/** Is `feature` granted, and with which limit (null = unlimited)? */
export function featureLimit(entitlement: NgEntitlement, feature: NgFeatureKey): NgFeatureLimit {
  void entitlement;
  void feature;
  throw new Error('NG-57: featureLimit not implemented');
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
  void plan;
  void prices;
  throw new Error('NG-57: priceOffersFor not implemented');
}

// Referenced so the imports type-check while the bodies are stubs.
void isNgCurrency;
void isNgFeatureKey;

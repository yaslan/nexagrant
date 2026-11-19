/**
 * NG-11 — what the plan screen draws, derived from the NG-57 server contract
 * (`src/lib/billing/nexagrant/view.ts`). Pure, so every state the screen can be
 * in is unit-tested without a browser.
 *
 * No number lives here: plan list, feature limits, prices and trial lengths are
 * all read from the catalogue the server returns (CLAUDE.md rule 7). The only
 * vocabulary imported is the closed list of feature keys, which fixes row order.
 */
import { NG_FEATURE_KEYS, type NgCurrency, type NgFeatureKey, type NgInterval } from '@/lib/billing/nexagrant/features';
import type { NgFeatureView, NgPlanView } from '@/lib/billing/nexagrant/view';
import { SESSION_REQUIRED_DIGEST } from '@/lib/session-required';

/** NgCatalogueMissingError's digest (src/lib/billing/nexagrant/repository.ts; not imported: that module is server-only). */
const NG_CATALOGUE_MISSING = 'NG_CATALOGUE_MISSING';

/** What a plan card says about money, for the selected currency and interval. */
export type NgPriceState =
  /** A purchasable amount exists for this currency and interval. */
  | { kind: 'price'; amountMinor: number; currency: NgCurrency; interval: NgInterval }
  /** The fallback plan every tenant drops to; nothing is sold. */
  | { kind: 'free' }
  /** Not sold in this channel (Kurumsal): "contact us". */
  | { kind: 'contact' }
  /** Sold, but no amount is published yet: "price coming soon". */
  | { kind: 'soon' };

export function priceStateFor(plan: NgPlanView, currency: NgCurrency, interval: NgInterval): NgPriceState {
  const offer = plan.prices.find((p) => p.currency === currency && p.interval === interval);
  // `purchasable` is the server's word (sellable AND amount > 0); the amount check
  // only narrows the type.
  if (offer && offer.purchasable && offer.amountMinor !== null && offer.amountMinor > 0) {
    return { kind: 'price', amountMinor: offer.amountMinor, currency, interval };
  }
  if (plan.isFallback) return { kind: 'free' };
  if (!plan.sellable) return { kind: 'contact' };
  return { kind: 'soon' };
}

/** Plans in the catalogue's own display order. */
export function sortPlans(plans: readonly NgPlanView[]): NgPlanView[] {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** One row of the feature matrix: a feature and, per plan (same order as the plans), its grant or null. */
export interface NgMatrixRow {
  key: NgFeatureKey;
  cells: (NgFeatureView | null)[];
}

/** Rows for every feature at least one plan grants, in NG_FEATURE_KEYS order. */
export function matrixRows(plans: readonly NgPlanView[]): NgMatrixRow[] {
  const rows: NgMatrixRow[] = [];
  for (const key of NG_FEATURE_KEYS) {
    const cells = plans.map((p) => p.features.find((f) => f.key === key) ?? null);
    if (cells.some((c) => c !== null)) rows.push({ key, cells });
  }
  return rows;
}

/** The currencies and intervals the catalogue actually has cells for, in first-seen order. */
export function offeredDimensions(plans: readonly NgPlanView[]): { currencies: NgCurrency[]; intervals: NgInterval[] } {
  const currencies: NgCurrency[] = [];
  const intervals: NgInterval[] = [];
  for (const plan of plans) {
    for (const p of plan.prices) {
      if (!currencies.includes(p.currency)) currencies.push(p.currency);
      if (!intervals.includes(p.interval)) intervals.push(p.interval);
    }
  }
  return { currencies, intervals };
}

/**
 * The currency shown first. A display default only: the rule for which currency a
 * customer is billed in is still open (NG-244 B4). Turkish UI → TL, any other → euro,
 * as long as the catalogue offers it.
 */
export function defaultCurrency(locale: string, offered: readonly NgCurrency[]): NgCurrency | null {
  const preferred: NgCurrency = locale === 'tr' ? 'TRY' : 'EUR';
  if (offered.includes(preferred)) return preferred;
  return offered[0] ?? null;
}

/** Yearly first when offered (06: the yearly plan is the headline). */
export function defaultInterval(offered: readonly NgInterval[]): NgInterval | null {
  if (offered.includes('year')) return 'year';
  return offered[0] ?? null;
}

/** Why a part of the screen could not be loaded. Never the raw error text. */
export type NgLoadError = 'session' | 'catalogue' | 'unknown';

/**
 * Maps a thrown error to a screen state by its `digest` / `code`
 * (SESSION_REQUIRED, NG_CATALOGUE_MISSING — the NG-57 contract).
 */
export function loadErrorOf(err: unknown): NgLoadError {
  if (err && typeof err === 'object') {
    const e = err as { digest?: unknown; code?: unknown };
    const tag = typeof e.digest === 'string' ? e.digest : typeof e.code === 'string' ? e.code : '';
    if (tag === SESSION_REQUIRED_DIGEST) return 'session';
    if (tag === NG_CATALOGUE_MISSING) return 'catalogue';
  }
  return 'unknown';
}

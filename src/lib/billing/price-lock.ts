/**
 * The joined price, kept.
 *
 * The pricing page promises, in both catalogues, that "the price you join at
 * stays yours" (`billingPanels.pricing.heroSubtitle`). Until TASK-MTR882HVZ8BG7
 * nothing in the product could keep it: `Subscription` held no tier, no rate
 * and no amount, and every price a subscriber was quoted came from
 * `getActiveTier()` — the campaign running *now*. Measured on this code before
 * the change: a tenant that joined Pro monthly under ILK5 paid $26.10, and once
 * the campaign ended the same tenant was quoted $87.00 for the same plan — 3.33×,
 * on a sentence that said the opposite.
 *
 * This module is the whole rule, and it is pure: no Prisma, no env, no React.
 * The two impure ends are thin — the sync paths write the lock, the quoting
 * surfaces read it.
 *
 * Two decisions worth stating once, because they are the ones a reader will
 * question:
 *
 *  1. **The lock is never worse than the shopfront.** If today's campaign is
 *     deeper than the rate a tenant locked, the tenant gets today's rate
 *     ({@link effectiveTier} takes the better of the two). "The price you join
 *     at stays yours" is a floor, not a ceiling; quoting an existing customer
 *     *more* than a stranger sees on the public page is the exact unfairness
 *     the sentence exists to prevent.
 *
 *  2. **The lock is immutable for the life of one subscription.** It is written
 *     on a first activation and on a re-activation after cancellation, and never
 *     rewritten in between. That makes duplicate provider events free
 *     (a second delivery finds a lock and keeps it) and means no later event can
 *     replace a good rate with a worse one, which is the failure mode an
 *     "upsert the current tier" version would have had.
 */

import {
  findTierByCode,
  NO_DISCOUNT_TIER,
  type DiscountTier,
} from './catalog';

/** The lock as the rest of the code wants it: whole, or absent. */
export interface SubscriptionPriceLock {
  /** The campaign the rate came from — provenance, not the price authority. */
  tierCode: string;
  /** The rate honoured on renewal and on any new line for this tenant. */
  percentOff: number;
  /** What one period actually cost at that rate, in minor units. Evidence. */
  amountMinor: number;
  currency: string;
  lockedAt: Date;
}

/** The five columns the lock lives in on `Subscription`. */
export interface PriceLockColumns {
  lockedTierCode: string | null;
  lockedPercentOff: number | null;
  lockedAmountMinor: number | null;
  lockedCurrency: string | null;
  priceLockedAt: Date | null;
}

/**
 * Rank given to a locked tier whose code is no longer in `DISCOUNT_TIERS`.
 *
 * A retired campaign must keep pricing — that is the point of a lock — so the
 * rate is read from the stored number and never looked up. `rank` only orders
 * the public schedule table, which is never rendered from a lock, so 0 ("ahead
 * of every listed tier") is a display placeholder, not a pricing input.
 */
const LOCKED_TIER_RANK = 0;

/**
 * Why a set of columns is not a usable lock, or `null` when it is fine.
 *
 * Kept separate from {@link readPriceLock} so that module stays pure while the
 * two server callers can still log a half-written lock instead of silently
 * charging the campaign of the day.
 */
export function priceLockDefect(columns: Partial<PriceLockColumns> | null | undefined): string | null {
  if (!columns) return null;
  const { lockedTierCode, lockedPercentOff, lockedAmountMinor, lockedCurrency, priceLockedAt } = columns;

  const present = [lockedTierCode, lockedPercentOff, lockedAmountMinor, lockedCurrency, priceLockedAt]
    .filter((value) => value !== null && value !== undefined).length;
  if (present === 0) return null;
  if (present < 5) return `price lock is partially written (${present}/5 columns set)`;

  if (typeof lockedPercentOff !== 'number' || !Number.isInteger(lockedPercentOff) ||
      lockedPercentOff < 0 || lockedPercentOff > 100) {
    return `locked discount is not a whole percent between 0 and 100 (${String(lockedPercentOff)})`;
  }
  if (typeof lockedAmountMinor !== 'number' || !Number.isInteger(lockedAmountMinor) || lockedAmountMinor < 0) {
    return `locked amount is not a non-negative integer minor amount (${String(lockedAmountMinor)})`;
  }
  if (typeof lockedTierCode !== 'string' || lockedTierCode.trim() === '') {
    return 'locked tier code is empty';
  }
  if (typeof lockedCurrency !== 'string' || lockedCurrency.trim() === '') {
    return 'locked currency is empty';
  }
  return null;
}

/** The lock on a subscription row, or `null` when there is none to honour. */
export function readPriceLock(
  columns: Partial<PriceLockColumns> | null | undefined
): SubscriptionPriceLock | null {
  if (!columns) return null;
  if (priceLockDefect(columns) !== null) return null;
  const { lockedTierCode, lockedPercentOff, lockedAmountMinor, lockedCurrency, priceLockedAt } = columns;
  if (
    lockedTierCode == null || lockedPercentOff == null || lockedAmountMinor == null ||
    lockedCurrency == null || priceLockedAt == null
  ) {
    return null;
  }
  return {
    tierCode: lockedTierCode.trim().toUpperCase(),
    percentOff: lockedPercentOff,
    amountMinor: lockedAmountMinor,
    currency: lockedCurrency.trim().toUpperCase(),
    lockedAt: priceLockedAt,
  };
}

/** The locked rate as a tier `priceLine` can price with. */
export function lockedTier(lock: SubscriptionPriceLock): DiscountTier {
  const listed = findTierByCode(lock.tierCode);
  return {
    code: lock.tierCode,
    // The stored rate wins even when the code is still listed: a campaign whose
    // percentage was edited must not silently re-rate everyone who joined it.
    percentOff: lock.percentOff,
    rank: listed?.rank ?? LOCKED_TIER_RANK,
    cumulativeSubscribers: listed?.cumulativeSubscribers ?? 0,
  };
}

/**
 * The tier a given tenant is priced under — the whole read side of the promise.
 *
 * No lock (no subscription yet, or a subscription that predates this feature)
 * means the shopfront tier, which is exactly what happened before: a tenant
 * whose sold rate was never recorded cannot be given one now without inventing
 * it.
 */
export function effectiveTier(
  lock: SubscriptionPriceLock | null,
  activeTier: DiscountTier
): DiscountTier {
  if (!lock) return activeTier;
  return activeTier.percentOff > lock.percentOff ? activeTier : lockedTier(lock);
}

/** True when the tenant is being quoted its own locked rate, not the campaign. */
export function isQuotedOnLock(
  lock: SubscriptionPriceLock | null,
  activeTier: DiscountTier
): boolean {
  return lock !== null && activeTier.percentOff <= lock.percentOff;
}

/** Statuses that mean the previous subscription is over, so a new one re-locks. */
const ENDED_STATUSES = new Set(['CANCELED', 'CANCELLED']);

export interface PriceLockDecisionInput {
  /** The subscription row as it stands *before* this event, or null. */
  existing: (Partial<PriceLockColumns> & { status?: string | null }) | null;
  /** The campaign running when this activation happened. */
  activeTier: DiscountTier;
  /** What this activation actually charges for one period. */
  charged: { amountMinor: number; currency: string };
  now: Date;
}

export type PriceLockDecision =
  | { action: 'keep'; reason: string }
  | { action: 'write'; reason: string; columns: PriceLockColumns };

/**
 * What an activation does to the lock. Idempotent by construction: the only
 * inputs that produce a write are "there is no subscription yet" and "the
 * previous one was cancelled", so a provider redelivering the same event lands
 * on `keep`.
 */
export function priceLockOnActivation({
  existing,
  activeTier,
  charged,
  now,
}: PriceLockDecisionInput): PriceLockDecision {
  const columns: PriceLockColumns = {
    lockedTierCode: activeTier.code,
    lockedPercentOff: activeTier.percentOff,
    lockedAmountMinor: charged.amountMinor,
    lockedCurrency: charged.currency.trim().toUpperCase(),
    priceLockedAt: now,
  };

  if (!existing) {
    return { action: 'write', reason: 'first activation for this tenant', columns };
  }

  const status = (existing.status ?? '').trim().toUpperCase();
  if (ENDED_STATUSES.has(status)) {
    return { action: 'write', reason: 're-activation after cancellation', columns };
  }

  if (readPriceLock(existing)) {
    return { action: 'keep', reason: 'the subscription already carries a lock' };
  }

  // A row written before this feature: nobody recorded what it was sold at, so
  // stamping today's campaign on it would be a guess that could quietly *raise*
  // the rate the customer is quoted. It stays unlocked and keeps being priced
  // at the shopfront tier, which is what it did yesterday.
  return { action: 'keep', reason: 'pre-existing subscription with no recorded rate; not inventing one' };
}

/** The columns that clear a lock. A cancelled subscription carries no price. */
export function clearedPriceLock(): PriceLockColumns {
  return {
    lockedTierCode: null,
    lockedPercentOff: null,
    lockedAmountMinor: null,
    lockedCurrency: null,
    priceLockedAt: null,
  };
}

/** The tier an iyzico (TRY) charge was actually sold under — see `src/lib/iyzico.ts`. */
export const IYZICO_SOLD_TIER: DiscountTier = NO_DISCOUNT_TIER;

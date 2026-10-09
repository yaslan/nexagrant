/**
 * Which early-bird discount tier is running right now — decided on the server.
 *
 * The pricing page currently lets the *browser* pick the tier from a radio
 * list and posts the chosen rate to checkout, which means the rate is a client
 * input. It is a server setting from here on: `getActiveTier()` is the only
 * answer checkout accepts, and a coupon code in a request may name a campaign
 * but can never set its rate.
 *
 * Source: the `BILLING_ACTIVE_TIER` environment variable (a tier code from
 * `DISCOUNT_TIERS`, or `NONE` for list price). Why not the live subscriber
 * count, which is what the ladder describes:
 *
 *  - Measured 2026-09-07 on this database: `Subscription` holds 1 row
 *    (status ACTIVE) across 1 tenant, and that row is the seeded demo tenant.
 *    A count-driven tier would read "1 subscriber → 70% off" from seed data.
 *  - The table has no way to tell a paying customer from a demo, beta or seeded
 *    tenant, and `SubStatus` counts TRIALING alongside ACTIVE. Until a paying
 *    subscriber is an auditable fact (CLAUDE.md rule 7 — a shown ratio must
 *    trace to a record), deriving everyone's price from that count would move
 *    prices on data nobody verified.
 *  - The env var is a deployment decision, not a statistic shown as a fact, and
 *    it is auditable in the deploy history.
 *
 * When paying subscribers do become countable, swap the body of
 * `getActiveTier()` for `tierForSubscriberCount(await countPayingSubscribers())`
 * — the ladder already carries the seat thresholds.
 */

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { DISCOUNT_TIERS, findTierByCode, NO_DISCOUNT_TIER, type DiscountTier } from './catalog';

/**
 * The tier applied when `BILLING_ACTIVE_TIER` is unset: **no discount**.
 *
 * This used to be the deepest tier (ILK5, 70% off), on the reasoning that an
 * unset setting must not charge more than the pricing page advertises. The
 * owner reversed it on 2026-09-07, and the asymmetry is why: an unset variable
 * defaulting to 70% off sells every plan at a third of its price and says
 * nothing, because "campaign running" is a valid state that logs nothing. The
 * opposite mistake — a campaign that has not started yet — is visible to
 * everyone who opens the pricing page.
 *
 * So the campaign is now an explicit opt-in: set `BILLING_ACTIVE_TIER=ILK5` to
 * run it. To keep the reversed risk from being silent in turn, an unset
 * variable is logged once per process by `getActiveTier()`.
 */
export const DEFAULT_ACTIVE_TIER: DiscountTier = NO_DISCOUNT_TIER;

/** Resolves a configured tier code. Pure — `getActiveTier` wraps it with env. */
export function resolveConfiguredTier(configured: string | undefined): DiscountTier {
  if (!configured || configured.trim() === '') return DEFAULT_ACTIVE_TIER;

  const tier = findTierByCode(configured);
  if (!tier) {
    // An unreadable setting must not quietly become "no discount" (a surprise
    // price rise) or "deepest discount" (revenue given away). Fall back to the
    // advertised default and make the misconfiguration loud.
    logger.warn('BILLING_ACTIVE_TIER names no known tier; falling back to the default tier', {
      configured,
      fallback: DEFAULT_ACTIVE_TIER.code,
      knownTiers: DISCOUNT_TIERS.map((t) => t.code).join(','),
    });
    return DEFAULT_ACTIVE_TIER;
  }
  return tier;
}

/** Warned once per process, so an unconfigured campaign is never silent. */
let warnedAboutUnsetTier = false;

/** The discount tier every server-side price is computed under. */
export function getActiveTier(): DiscountTier {
  const configured = env.BILLING_ACTIVE_TIER;
  if ((!configured || configured.trim() === '') && !warnedAboutUnsetTier) {
    warnedAboutUnsetTier = true;
    logger.warn('BILLING_ACTIVE_TIER is unset; selling at list price with no campaign discount', {
      default: DEFAULT_ACTIVE_TIER.code,
      hint: 'Set BILLING_ACTIVE_TIER to a tier code (e.g. ILK5) to run a campaign.',
      knownTiers: DISCOUNT_TIERS.map((t) => t.code).join(','),
    });
  }
  return resolveConfiguredTier(configured);
}

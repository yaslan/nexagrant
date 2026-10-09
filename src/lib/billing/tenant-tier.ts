/**
 * The discount tier one tenant is actually priced at.
 *
 * Split out of `POST /api/billing/checkout` so that the cart's quote endpoint
 * and the charge itself cannot answer "what discount applies to this tenant"
 * differently — a drawer quoting the shopfront campaign while checkout applies
 * the tenant's own locked rate is the display/charge mismatch this codebase has
 * already been bitten by twice.
 */

import { withTenant } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getActiveTier } from '@/lib/billing/active-tier';
import type { DiscountTier } from '@/lib/billing/catalog';
import {
  effectiveTier,
  priceLockDefect,
  readPriceLock,
  type PriceLockColumns,
} from '@/lib/billing/price-lock';

/**
 * The tenant's own locked rate, when it has one.
 *
 * A miss here must never become a *higher* price by accident, so a database
 * error is logged and treated as "no lock" — the same tier the shopfront is
 * quoting — rather than swallowed into some other rate. The read goes through
 * `withTenant` because `Subscription` is under RLS.
 */
export async function lockedRateFor(tenantId: string) {
  try {
    const row = await withTenant<(Partial<PriceLockColumns>) | null>(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        select: {
          lockedTierCode: true,
          lockedPercentOff: true,
          lockedAmountMinor: true,
          lockedCurrency: true,
          priceLockedAt: true,
        },
      })
    );
    const defect = priceLockDefect(row);
    if (defect) {
      logger.warn('A price lock is unusable; pricing at the active tier', { tenantId, defect });
    }
    return readPriceLock(row);
  } catch (error) {
    logger.error('Could not read the price lock; pricing at the active tier', error, { tenantId });
    return null;
  }
}

export interface TenantTier {
  /** The campaign the shopfront is running right now. */
  shopfront: DiscountTier;
  /** What this tenant is priced at: its lock if it has one, else the shopfront. */
  effective: DiscountTier;
  /** True when the two differ because the tenant carries a lock. */
  locked: boolean;
}

/**
 * "The price you join at stays yours": a tenant that already carries a lock is
 * priced at its own rate, so an upgrade or a cycle change made after a campaign
 * ended still costs what the customer joined at. A tenant with no lock is
 * priced at the shopfront tier.
 */
export async function tierForTenant(tenantId: string): Promise<TenantTier> {
  const shopfront = getActiveTier();
  const lock = await lockedRateFor(tenantId);
  return {
    shopfront,
    effective: effectiveTier(lock, shopfront),
    locked: lock !== null,
  };
}

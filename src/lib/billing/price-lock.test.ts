/**
 * The joined price, kept — TASK-MTR882HVZ8BG7.
 *
 * The behaviour under test is a promise printed on the pricing page in both
 * catalogues: "the price you join at stays yours". Each edge case the task
 * named has a test here, by name, so the answer to "what happens if…" is a
 * line in this file rather than an opinion.
 */
import { describe, it, expect } from 'vitest';
import { findTierByCode, priceLine, NO_DISCOUNT_TIER, type DiscountTier } from './catalog';
import {
  clearedPriceLock,
  effectiveTier,
  isQuotedOnLock,
  lockedTier,
  priceLockDefect,
  priceLockOnActivation,
  readPriceLock,
  type PriceLockColumns,
} from './price-lock';

function tier(code: string): DiscountTier {
  const found = findTierByCode(code);
  if (!found) throw new Error(`test asked for unknown tier ${code}`);
  return found;
}

const LOCKED_AT = new Date('2026-03-01T09:00:00.000Z');
const NOW = new Date('2026-09-07T12:00:00.000Z');

/** A tenant that joined Pro monthly under ILK5: $87.00 list, $26.10 charged. */
function ilk5ProLock(): PriceLockColumns {
  return {
    lockedTierCode: 'ILK5',
    lockedPercentOff: 70,
    lockedAmountMinor: 2_610,
    lockedCurrency: 'USD',
    priceLockedAt: LOCKED_AT,
  };
}

describe('readPriceLock / priceLockDefect', () => {
  it('reads a whole lock', () => {
    const lock = readPriceLock(ilk5ProLock());
    expect(lock).toEqual({
      tierCode: 'ILK5',
      percentOff: 70,
      amountMinor: 2_610,
      currency: 'USD',
      lockedAt: LOCKED_AT,
    });
    expect(priceLockDefect(ilk5ProLock())).toBeNull();
  });

  it('treats a row with no lock columns as unlocked, not as a defect', () => {
    const none = clearedPriceLock();
    expect(readPriceLock(none)).toBeNull();
    expect(priceLockDefect(none)).toBeNull();
    expect(readPriceLock(null)).toBeNull();
  });

  it('refuses a half-written lock and says which half', () => {
    const partial = { ...ilk5ProLock(), lockedCurrency: null };
    expect(readPriceLock(partial)).toBeNull();
    expect(priceLockDefect(partial)).toMatch(/partially written \(4\/5/);
  });

  it('refuses an out-of-range rate rather than pricing with it', () => {
    for (const bad of [-1, 101, 12.5]) {
      const row = { ...ilk5ProLock(), lockedPercentOff: bad };
      expect(readPriceLock(row)).toBeNull();
      expect(priceLockDefect(row)).toMatch(/whole percent/);
    }
  });

  it('refuses a negative or fractional locked amount', () => {
    for (const bad of [-100, 26.5]) {
      const row = { ...ilk5ProLock(), lockedAmountMinor: bad };
      expect(readPriceLock(row)).toBeNull();
      expect(priceLockDefect(row)).toMatch(/non-negative integer/);
    }
  });

  it('normalises the tier code and currency it read', () => {
    const lock = readPriceLock({ ...ilk5ProLock(), lockedTierCode: ' ilk5 ', lockedCurrency: 'usd' });
    expect(lock?.tierCode).toBe('ILK5');
    expect(lock?.currency).toBe('USD');
  });
});

describe('effectiveTier — what an existing subscriber is priced under', () => {
  it('honours the joined rate once the campaign is over — the promise itself', () => {
    const lock = readPriceLock(ilk5ProLock());
    const effective = effectiveTier(lock, NO_DISCOUNT_TIER);
    expect(effective.percentOff).toBe(70);

    // The measured violation, now closed: joined at $26.10, still $26.10.
    expect(priceLine({ sku: 'pro', billingCycle: 'monthly' }, effective).amountMinor).toBe(2_610);
    // And a visitor with no lock still sees the campaign of the day.
    expect(priceLine({ sku: 'pro', billingCycle: 'monthly' }, NO_DISCOUNT_TIER).amountMinor).toBe(8_700);
  });

  it('honours it when the campaign only got shallower', () => {
    const lock = readPriceLock(ilk5ProLock());
    expect(effectiveTier(lock, tier('PROMO10')).percentOff).toBe(70);
  });

  it('changes nothing for a tenant with no lock', () => {
    expect(effectiveTier(null, tier('LANSMAN50'))).toEqual(tier('LANSMAN50'));
    expect(effectiveTier(null, NO_DISCOUNT_TIER)).toEqual(NO_DISCOUNT_TIER);
  });

  // Edge case: "the campaign today is deeper than the lock".
  it('gives the deeper campaign when today beats the lock — a floor, not a ceiling', () => {
    const lock = readPriceLock({ ...ilk5ProLock(), lockedTierCode: 'KURUCU40', lockedPercentOff: 40 });
    const effective = effectiveTier(lock, tier('ILK5'));
    expect(effective.percentOff).toBe(70);
    expect(effective.code).toBe('ILK5');
    expect(isQuotedOnLock(lock, tier('ILK5'))).toBe(false);
    // A locked customer is never quoted more than a stranger on the public page.
    expect(priceLine({ sku: 'pro', billingCycle: 'monthly' }, effective).amountMinor).toBe(
      priceLine({ sku: 'pro', billingCycle: 'monthly' }, tier('ILK5')).amountMinor
    );
  });

  it('keeps the lock when the two rates are equal, so the code shown is the customer’s own', () => {
    const lock = readPriceLock(ilk5ProLock());
    expect(effectiveTier(lock, tier('ILK5')).code).toBe('ILK5');
    expect(isQuotedOnLock(lock, tier('ILK5'))).toBe(true);
  });

  // Edge case: "the locked tier code is no longer in DISCOUNT_TIERS".
  it('still prices a lock whose campaign has been retired from the ladder', () => {
    const retired = readPriceLock({ ...ilk5ProLock(), lockedTierCode: 'XMAS2025', lockedPercentOff: 65 });
    expect(findTierByCode('XMAS2025')).toBeNull();
    const effective = effectiveTier(retired, NO_DISCOUNT_TIER);
    expect(effective.code).toBe('XMAS2025');
    expect(effective.percentOff).toBe(65);
    expect(priceLine({ sku: 'pro', billingCycle: 'monthly' }, effective).amountMinor).toBe(3_045);
  });

  it('prices from the stored rate even when the listed campaign has been re-rated since', () => {
    // Someone edits ILK5 from 70% to 30%: everyone who joined at 70% keeps 70%.
    const lock = readPriceLock(ilk5ProLock());
    const reRatedIlk5: DiscountTier = { ...tier('ILK5'), percentOff: 30 };
    expect(lockedTier(lock!).percentOff).toBe(70);
    expect(effectiveTier(lock, reRatedIlk5).percentOff).toBe(70);
  });

  // Edge case: "plan change (upgrade / downgrade) — does the lock carry?".
  it('carries the rate across an upgrade and a downgrade — the customer joined the campaign, not the plan', () => {
    const lock = readPriceLock(ilk5ProLock());
    const effective = effectiveTier(lock, NO_DISCOUNT_TIER);
    expect(priceLine({ sku: 'ultra', billingCycle: 'monthly' }, effective).amountMinor).toBe(4_410);
    expect(priceLine({ sku: 'basic', billingCycle: 'monthly' }, effective).amountMinor).toBe(1_350);
    // The rate carries; the amount snapshot does not pretend to be the new plan's.
    expect(lock?.amountMinor).toBe(2_610);
  });

  it('carries the rate across a monthly → yearly switch', () => {
    const lock = readPriceLock(ilk5ProLock());
    const effective = effectiveTier(lock, NO_DISCOUNT_TIER);
    expect(priceLine({ sku: 'pro', billingCycle: 'yearly' }, effective).amountMinor).toBe(22_410);
  });

  it('does not touch a lifetime licence, which carries its own fixed discount', () => {
    const lock = readPriceLock(ilk5ProLock());
    const onLock = priceLine({ sku: 'lifetime-ultra' }, effectiveTier(lock, NO_DISCOUNT_TIER));
    const onShopfront = priceLine({ sku: 'lifetime-ultra' }, NO_DISCOUNT_TIER);
    expect(onLock.amountMinor).toBe(onShopfront.amountMinor);
  });
});

describe('priceLockOnActivation — when the lock is written', () => {
  it('locks a tenant’s first ever subscription at the running campaign', () => {
    const decision = priceLockOnActivation({
      existing: null,
      activeTier: tier('ILK5'),
      charged: { amountMinor: 2_610, currency: 'usd' },
      now: NOW,
    });
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') throw new Error('unreachable');
    expect(decision.columns).toEqual({
      lockedTierCode: 'ILK5',
      lockedPercentOff: 70,
      lockedAmountMinor: 2_610,
      lockedCurrency: 'USD',
      priceLockedAt: NOW,
    });
  });

  it('is idempotent: the same event twice leaves the first lock alone', () => {
    const first = priceLockOnActivation({
      existing: null,
      activeTier: tier('ILK5'),
      charged: { amountMinor: 2_610, currency: 'USD' },
      now: LOCKED_AT,
    });
    if (first.action !== 'write') throw new Error('expected a write');

    const second = priceLockOnActivation({
      existing: { ...first.columns, status: 'ACTIVE' },
      activeTier: tier('ILK5'),
      charged: { amountMinor: 2_610, currency: 'USD' },
      now: NOW,
    });
    expect(second.action).toBe('keep');
  });

  it('never lets a later event overwrite a good rate with a worse one', () => {
    const later = priceLockOnActivation({
      existing: { ...ilk5ProLock(), status: 'ACTIVE' },
      activeTier: NO_DISCOUNT_TIER, // the campaign has ended since
      charged: { amountMinor: 8_700, currency: 'USD' },
      now: NOW,
    });
    expect(later.action).toBe('keep');
  });

  it('does not rewrite the lock on a plan change', () => {
    const upgrade = priceLockOnActivation({
      existing: { ...ilk5ProLock(), status: 'ACTIVE' },
      activeTier: tier('PROMO10'),
      charged: { amountMinor: 13_230, currency: 'USD' },
      now: NOW,
    });
    expect(upgrade.action).toBe('keep');
    expect(upgrade.reason).toMatch(/already carries a lock/);
  });

  // Edge case: "a legacy subscription with no lock" — demo-tenant/pro today.
  it('leaves a pre-existing unlocked subscription unlocked rather than guessing its rate', () => {
    const legacy = priceLockOnActivation({
      existing: { ...clearedPriceLock(), status: 'ACTIVE' },
      activeTier: NO_DISCOUNT_TIER,
      charged: { amountMinor: 8_700, currency: 'USD' },
      now: NOW,
    });
    expect(legacy.action).toBe('keep');
    expect(legacy.reason).toMatch(/not inventing one/);
  });

  // Edge case: "re-subscribing after a cancellation — the lock is renewed".
  it('re-locks at today’s campaign when a cancelled subscription comes back', () => {
    const cleared = { ...clearedPriceLock(), status: 'CANCELED' };
    const rejoin = priceLockOnActivation({
      existing: cleared,
      activeTier: tier('PROMO10'),
      charged: { amountMinor: 7_830, currency: 'USD' },
      now: NOW,
    });
    expect(rejoin.action).toBe('write');
    if (rejoin.action !== 'write') throw new Error('unreachable');
    expect(rejoin.columns.lockedPercentOff).toBe(10);
    expect(rejoin.columns.priceLockedAt).toBe(NOW);
  });

  it('re-locks a cancelled row even if its old lock was never cleared', () => {
    const stale = { ...ilk5ProLock(), status: 'CANCELED' };
    const rejoin = priceLockOnActivation({
      existing: stale,
      activeTier: tier('PROMO10'),
      charged: { amountMinor: 7_830, currency: 'USD' },
      now: NOW,
    });
    expect(rejoin.action).toBe('write');
    if (rejoin.action !== 'write') throw new Error('unreachable');
    expect(rejoin.columns.lockedTierCode).toBe('PROMO10');
  });

  it('writes a no-discount lock when nothing is running, so list price is kept too', () => {
    const decision = priceLockOnActivation({
      existing: null,
      activeTier: NO_DISCOUNT_TIER,
      charged: { amountMinor: 8_700, currency: 'USD' },
      now: NOW,
    });
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') throw new Error('unreachable');
    expect(decision.columns.lockedTierCode).toBe('NONE');
    expect(decision.columns.lockedPercentOff).toBe(0);
    // And it reads back as a lock, so a later campaign still reaches them
    // (a floor, not a ceiling) without a deeper rate ever being taken away.
    const lock = readPriceLock(decision.columns);
    expect(effectiveTier(lock, tier('ILK5')).percentOff).toBe(70);
  });

  it('every write it produces satisfies the database’s completeness check', () => {
    const decision = priceLockOnActivation({
      existing: null,
      activeTier: tier('SCALE20'),
      charged: { amountMinor: 6_960, currency: 'USD' },
      now: NOW,
    });
    if (decision.action !== 'write') throw new Error('expected a write');
    expect(priceLockDefect(decision.columns)).toBeNull();
  });
});

describe('clearedPriceLock', () => {
  it('nulls all five columns together, which the completeness check requires', () => {
    const cleared = clearedPriceLock();
    expect(Object.values(cleared).every((v) => v === null)).toBe(true);
    expect(priceLockDefect(cleared)).toBeNull();
    expect(readPriceLock(cleared)).toBeNull();
  });
});

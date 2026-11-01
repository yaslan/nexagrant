import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NO_DISCOUNT_TIER, DISCOUNT_TIERS, findTierByCode, priceLine } from './catalog';

/**
 * The storefront's behaviour when the database misbehaves, and the arithmetic
 * it does on rows that come back.
 *
 * tests/plan-storefront.spec.ts covers the real thing against Postgres under
 * the role that enforces RLS. What that suite cannot easily produce is a
 * *failed* read, and the page's answer to one is a claim this codebase takes
 * seriously: an unreadable price list renders as "we cannot price this", never
 * as an empty catalogue and never as the static figures the storefront replaced
 * (CLAUDE.md rule 7 — absence is not zero).
 */

const listPublicPlans = vi.fn();
const plansVisibleToTenant = vi.fn();

vi.mock('./plan-repository', () => ({
  listPublicPlans: () => listPublicPlans(),
  plansVisibleToTenant: (tenantId: string) => plansVisibleToTenant(tenantId),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { readStorefront, storefrontPlans, priceStorefrontPlan, priceTierSchedule, priceLineForTenant, PlanNotAvailableError } =
  await import('./storefront');

/** A published version row, shaped as the repository returns it. */
function row(planId: string, monthly: number, yearly: number, visibility = 'public') {
  return {
    plan: { id: planId, name: planId.toUpperCase(), visibility },
    version: {
      id: `pv_${planId}_1`,
      planId,
      version: 1,
      status: 'published',
      monthlyCents: monthly,
      yearlyCents: yearly,
      currency: 'USD',
      seats: 3,
      workspaces: 1,
      aiCreditsMonthly: 100,
      modules: ['M1'],
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      plan: { name: planId.toUpperCase(), visibility },
    },
  };
}

beforeEach(() => {
  listPublicPlans.mockReset();
  plansVisibleToTenant.mockReset();
});

describe('an unreadable plan list', () => {
  it('is reported as unmeasured, with no cards and no invented price', async () => {
    listPublicPlans.mockRejectedValue(new Error('connection refused'));
    const listing = await readStorefront(null, NO_DISCOUNT_TIER, NO_DISCOUNT_TIER, DISCOUNT_TIERS);
    expect(listing.measured).toBe(false);
    expect(listing.cards).toEqual([]);
    expect(listing.schedule).toEqual([]);
  });

  it('is distinguishable from a genuinely empty catalogue', async () => {
    listPublicPlans.mockResolvedValue([]);
    const listing = await readStorefront(null, NO_DISCOUNT_TIER, NO_DISCOUNT_TIER, DISCOUNT_TIERS);
    // Same empty card list, different fact. The pages render different copy for
    // the two, which is the whole point of carrying the flag.
    expect(listing.measured).toBe(true);
    expect(listing.cards).toEqual([]);
  });
});

describe('what reaches the storefront', () => {
  it('drops the free tier, which is a fallback state and not for sale', async () => {
    listPublicPlans.mockResolvedValue([row('free', 0, 0), row('pro', 8_700, 74_700)]);
    const plans = await storefrontPlans(null);
    expect(plans.map((plan) => plan.planId)).toEqual(['pro']);
  });

  it('asks the public list for an anonymous visitor and the tenant list otherwise', async () => {
    listPublicPlans.mockResolvedValue([row('pro', 8_700, 74_700)]);
    plansVisibleToTenant.mockResolvedValue([row('pro', 8_700, 74_700), row('bespoke', 50_000, 500_000, 'private')]);

    expect((await storefrontPlans(null)).map((plan) => plan.planId)).toEqual(['pro']);
    expect(listPublicPlans).toHaveBeenCalledTimes(1);
    expect(plansVisibleToTenant).not.toHaveBeenCalled();

    expect((await storefrontPlans('tenant-1')).map((plan) => plan.planId)).toEqual(['pro', 'bespoke']);
    expect(plansVisibleToTenant).toHaveBeenCalledWith('tenant-1');
  });
});

describe('pricing a storefront plan', () => {
  it('produces exactly what priceLine produces for the same figures', () => {
    // The storefront must not become a second implementation of the discount
    // and rounding rules; it shapes a row and hands it to the catalogue's own
    // pricing function. `pro` in catalog.ts carries these very figures, so the
    // two paths are directly comparable.
    const tier = findTierByCode('ILK5')!;
    const card = priceStorefrontPlan(
      {
        planId: 'pro',
        sku: 'plan-pro',
        name: 'Pro',
        visibility: 'public',
        versionId: 'pv_pro_1',
        version: 1,
        currency: 'USD',
        monthlyListMinor: 8_700,
        yearlyListMinor: 74_700,
        seats: 6,
        workspaces: 1,
        aiCreditsMonthly: 500,
        modules: [],
        features: [],
      },
      tier,
      NO_DISCOUNT_TIER
    );

    expect(card.monthly.charged.amountMinor).toBe(priceLine({ sku: 'plan-pro', billingCycle: 'monthly' }, tier).amountMinor);
    expect(card.yearly.charged.amountMinor).toBe(priceLine({ sku: 'plan-pro', billingCycle: 'yearly' }, tier).amountMinor);
    expect(card.monthly.list.amountMinor).toBe(8_700);
    // $87.00 × 12 = $1,044.00 against a $747.00 year → 28% cheaper.
    expect(card.yearlySavingPercent).toBe(28);
  });

  it('carries the version currency rather than assuming the catalogue one', () => {
    const card = priceStorefrontPlan(
      {
        planId: 'eur-plan',
        sku: 'plan-eur-plan',
        name: 'EUR Plan',
        visibility: 'public',
        versionId: 'pv_eur_1',
        version: 1,
        currency: 'EUR',
        monthlyListMinor: 5_000,
        yearlyListMinor: 50_000,
        seats: 1,
        workspaces: 1,
        aiCreditsMonthly: 1,
        modules: [],
        features: [],
      },
      NO_DISCOUNT_TIER,
      NO_DISCOUNT_TIER
    );
    expect(card.monthly.charged.currency).toBe('EUR');
  });

  it('prices the whole tier schedule off the same rows', () => {
    const plans = [
      {
        planId: 'pro',
        sku: 'plan-pro',
        name: 'Pro',
        visibility: 'public',
        versionId: 'pv_pro_1',
        version: 1,
        currency: 'USD',
        monthlyListMinor: 10_000,
        yearlyListMinor: 100_000,
        seats: 1,
        workspaces: 1,
        aiCreditsMonthly: 1,
        modules: [],
        features: [],
      },
    ];
    const schedule = priceTierSchedule(plans, DISCOUNT_TIERS);
    expect(schedule).toHaveLength(DISCOUNT_TIERS.length);
    const ilk5 = schedule.find((rowEntry) => rowEntry.tierCode === 'ILK5')!;
    expect(ilk5.cells[0]!.amountMinor).toBe(3_000); // 70% off $100.00
  });
});

describe('refusing a line', () => {
  it('refuses a sku no visible plan carries', async () => {
    listPublicPlans.mockResolvedValue([row('pro', 8_700, 74_700)]);
    await expect(priceLineForTenant({ sku: 'plan-bespoke' }, NO_DISCOUNT_TIER, null)).rejects.toBeInstanceOf(
      PlanNotAvailableError
    );
  });

  it('does not let a failed read become a purchase', async () => {
    // The listing degrades to "unmeasured". The *purchase* must not degrade at
    // all: a database that cannot say whether this tenant may buy a plan is not
    // permission to sell it one.
    listPublicPlans.mockRejectedValue(new Error('connection refused'));
    await expect(priceLineForTenant({ sku: 'plan-pro' }, NO_DISCOUNT_TIER, null)).rejects.toThrow(
      /connection refused/
    );
  });

  it('still prices the one-time lifetime licence from the catalogue', async () => {
    // It has no `Plan` row, so the database is never consulted for it.
    const line = await priceLineForTenant({ sku: 'lifetime-ultra' }, NO_DISCOUNT_TIER, null);
    expect(line.amountMinor).toBe(128_800);
    expect(listPublicPlans).not.toHaveBeenCalled();
  });
});

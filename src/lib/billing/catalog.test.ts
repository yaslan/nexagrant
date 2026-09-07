import { describe, it, expect } from 'vitest';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';
import { applyPercentDiscount } from '../money';
import {
  CATALOG,
  CATALOG_CURRENCY,
  DISCOUNT_TIERS,
  MONTHS_PER_YEAR,
  NO_DISCOUNT_TIER,
  findEntry,
  findTierByCode,
  priceLine,
  tierForSubscriberCount,
  UnknownSkuError,
  UnsupportedCycleError,
  FALLBACK_PLAN_ID,
  PLAN_GRANTS,
  RETIRED_PLAN_IDS,
  grantsFor,
  plansGrantingModule,
  resolvePlanId,
  type DiscountTier,
} from './catalog';
import { DEFAULT_ACTIVE_TIER, resolveConfiguredTier } from './active-tier';

function tier(code: string): DiscountTier {
  const found = findTierByCode(code);
  if (!found) throw new Error(`test asked for unknown tier ${code}`);
  return found;
}

/**
 * The price table, written out rather than computed, so the test is a spec the
 * catalogue must match and not a second implementation of the same arithmetic.
 * Cents, USD. Rows: planId → percentOff → { monthly, yearly }.
 */
const EXPECTED: Record<string, Record<number, { monthly: number; yearly: number }>> = {
  basic: {
    70: { monthly: 1_350, yearly: 11_610 },
    60: { monthly: 1_800, yearly: 15_480 },
    50: { monthly: 2_250, yearly: 19_350 },
    40: { monthly: 2_700, yearly: 23_220 },
    30: { monthly: 3_150, yearly: 27_090 },
    20: { monthly: 3_600, yearly: 30_960 },
    10: { monthly: 4_050, yearly: 34_830 },
    0: { monthly: 4_500, yearly: 38_700 },
  },
  pro: {
    70: { monthly: 2_610, yearly: 22_410 },
    60: { monthly: 3_480, yearly: 29_880 },
    50: { monthly: 4_350, yearly: 37_350 },
    40: { monthly: 5_220, yearly: 44_820 },
    30: { monthly: 6_090, yearly: 52_290 },
    20: { monthly: 6_960, yearly: 59_760 },
    10: { monthly: 7_830, yearly: 67_230 },
    0: { monthly: 8_700, yearly: 74_700 },
  },
  ultra: {
    70: { monthly: 4_410, yearly: 35_910 },
    60: { monthly: 5_880, yearly: 47_880 },
    50: { monthly: 7_350, yearly: 59_850 },
    40: { monthly: 8_820, yearly: 71_820 },
    30: { monthly: 10_290, yearly: 83_790 },
    20: { monthly: 11_760, yearly: 95_760 },
    10: { monthly: 13_230, yearly: 107_730 },
    0: { monthly: 14_700, yearly: 119_700 },
  },
};

const ALL_TIERS: DiscountTier[] = [...DISCOUNT_TIERS, NO_DISCOUNT_TIER];

describe('catalogue prices — every plan × every tier × every cycle', () => {
  for (const planId of ['basic', 'pro', 'ultra'] as const) {
    for (const activeTier of ALL_TIERS) {
      const expected = EXPECTED[planId]?.[activeTier.percentOff];
      it(`${planId} at ${activeTier.code} (-${activeTier.percentOff}%)`, () => {
        expect(expected).toBeDefined();

        const monthly = priceLine({ sku: planId, billingCycle: 'monthly' }, activeTier);
        expect(monthly.amountMinor).toBe(expected!.monthly);
        expect(monthly.currency).toBe(CATALOG_CURRENCY);
        expect(monthly.recurringInterval).toBe('month');
        expect(monthly.campaignCode).toBe(activeTier.code);

        const yearly = priceLine({ sku: planId, billingCycle: 'yearly' }, activeTier);
        expect(yearly.amountMinor).toBe(expected!.yearly);
        expect(yearly.recurringInterval).toBe('year');
      });
    }
  }

  it('defaults to the monthly cycle when the request does not say', () => {
    expect(priceLine({ sku: 'plan-pro' }, tier('ILK5')).billingCycle).toBe('monthly');
  });

  it('multiplies the line total by quantity without touching the unit amount', () => {
    const line = priceLine({ sku: 'plan-pro', billingCycle: 'monthly', quantity: 3 }, tier('ILK5'));
    expect(line.amountMinor).toBe(2_610);
    expect(line.totalMinor).toBe(7_830);
  });

  it('rejects a quantity that is not a positive integer', () => {
    expect(() => priceLine({ sku: 'plan-pro', quantity: 0 }, tier('ILK5'))).toThrow();
    expect(() => priceLine({ sku: 'plan-pro', quantity: 1.5 }, tier('ILK5'))).toThrow();
  });
});

describe('yearly derivation', () => {
  it('discounts the yearly total once instead of the monthly figure twelve times', () => {
    // The advertised monthly-equivalent for Basic yearly is $32.25 = 3225¢.
    // Discounting that first rounds a half-cent up and multiplies the error by 12.
    const perMonthFirst = applyPercentDiscount(3_225, 70) * MONTHS_PER_YEAR;
    expect(perMonthFirst).toBe(11_616);

    const charged = priceLine({ sku: 'basic', billingCycle: 'yearly' }, tier('ILK5')).amountMinor;
    expect(charged).toBe(11_610);
    expect(perMonthFirst - charged).toBe(6); // 6¢/year the customer does not owe
  });

  it('lists the year as exactly twelve times the advertised monthly-equivalent', () => {
    expect(priceLine({ sku: 'basic', billingCycle: 'yearly' }, NO_DISCOUNT_TIER).amountMinor).toBe(3_225 * MONTHS_PER_YEAR);
    expect(priceLine({ sku: 'pro', billingCycle: 'yearly' }, NO_DISCOUNT_TIER).amountMinor).toBe(6_225 * MONTHS_PER_YEAR);
    expect(priceLine({ sku: 'ultra', billingCycle: 'yearly' }, NO_DISCOUNT_TIER).amountMinor).toBe(9_975 * MONTHS_PER_YEAR);
  });

  it('exposes a display-only monthly equivalent that is never the charged amount', () => {
    const line = priceLine({ sku: 'basic', billingCycle: 'yearly' }, tier('ILK5'));
    expect(line.monthlyEquivalentMinor).toBe(968); // 11610 / 12 = 967.5 → 968 for display
    expect(line.amountMinor).toBe(11_610); // what Stripe is actually asked for
  });
});

describe('Ultra Lifetime', () => {
  it('carries its own fixed 50% campaign, whatever the rolling tier is', () => {
    for (const activeTier of ALL_TIERS) {
      const line = priceLine({ sku: 'lifetime-ultra' }, activeTier);
      expect(line.listAmountMinor).toBe(257_600); // $2,576.00
      expect(line.amountMinor).toBe(128_800); //     $1,288.00
      expect(line.percentOff).toBe(50);
      expect(line.campaignCode).toBe('OMURBOYU20');
      expect(line.recurringInterval).toBeNull();
      expect(line.billingCycle).toBe('one-time');
    }
  });

  it('refuses to be sold as a subscription', () => {
    expect(() => priceLine({ sku: 'lifetime-ultra', billingCycle: 'yearly' }, tier('ILK5'))).toThrow(UnsupportedCycleError);
  });
});

describe('sku lookup', () => {
  it('accepts both the cart sku and the bare plan id', () => {
    expect(findEntry('plan-pro')?.sku).toBe('plan-pro');
    expect(findEntry('pro')?.sku).toBe('plan-pro');
    expect(findEntry('PRO')?.sku).toBe('plan-pro');
  });

  it('throws UnknownSkuError rather than falling back to a default price', () => {
    expect(() => priceLine({ sku: 'plan-enterprise' }, tier('ILK5'))).toThrow(UnknownSkuError);
    expect(() => priceLine({ sku: '' }, tier('ILK5'))).toThrow(UnknownSkuError);
  });

  it('refuses to bill a recurring plan as one-time', () => {
    expect(() => priceLine({ sku: 'plan-pro', billingCycle: 'one-time' }, tier('ILK5'))).toThrow(UnsupportedCycleError);
  });

  it('prices every catalogue entry above the 50¢ provider minimum at the deepest tier', () => {
    for (const entry of CATALOG) {
      const cycles = entry.kind === 'lifetime' ? (['one-time'] as const) : (['monthly', 'yearly'] as const);
      for (const cycle of cycles) {
        expect(priceLine({ sku: entry.sku, billingCycle: cycle }, tier('ILK5')).amountMinor).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe('discount tiers', () => {
  it('runs deepest first and never repeats a code', () => {
    const codes = DISCOUNT_TIERS.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    const percents = DISCOUNT_TIERS.map((t) => t.percentOff);
    expect(percents).toEqual([70, 60, 50, 40, 30, 20, 10]);
  });

  it('maps a subscriber count onto the ladder, ending at list price', () => {
    expect(tierForSubscriberCount(0).code).toBe('ILK5');
    expect(tierForSubscriberCount(4).code).toBe('ILK5');
    expect(tierForSubscriberCount(5).code).toBe('SONRAKI10');
    expect(tierForSubscriberCount(14).code).toBe('SONRAKI10');
    expect(tierForSubscriberCount(15).code).toBe('LANSMAN50');
    expect(tierForSubscriberCount(884).code).toBe('PROMO10');
    expect(tierForSubscriberCount(885).code).toBe(NO_DISCOUNT_TIER.code);
    expect(tierForSubscriberCount(100_000).percentOff).toBe(0);
  });

  it('does not resolve an unknown coupon code to a rate', () => {
    expect(findTierByCode('NOT_A_CAMPAIGN')).toBeNull();
    expect(findTierByCode(undefined)).toBeNull();
    expect(findTierByCode('ilk5')?.percentOff).toBe(70);
  });
});

describe('active tier resolution', () => {
  it('falls back to the advertised default when unset', () => {
    expect(resolveConfiguredTier(undefined).code).toBe(DEFAULT_ACTIVE_TIER.code);
    expect(resolveConfiguredTier('   ').code).toBe(DEFAULT_ACTIVE_TIER.code);
  });

  it('defaults to NO discount, so a forgotten setting cannot give the product away', () => {
    // Owner decision, 2026-09-07: an unset variable that sells at 70% off is a
    // silent loss; a campaign that has not started is visible on the page.
    expect(DEFAULT_ACTIVE_TIER.percentOff).toBe(0);
    expect(resolveConfiguredTier(undefined).percentOff).toBe(0);
  });

  it('honours a configured tier code, including NONE', () => {
    expect(resolveConfiguredTier('LANSMAN50').percentOff).toBe(50);
    expect(resolveConfiguredTier('none').percentOff).toBe(0);
  });

  it('falls back loudly instead of guessing when the setting is unreadable', () => {
    expect(resolveConfiguredTier('50%').code).toBe(DEFAULT_ACTIVE_TIER.code);
  });
});

describe('plan entitlements', () => {
  it('prices every purchasable plan and never prices the fallback', () => {
    for (const grant of PLAN_GRANTS) {
      const entry = findEntry(grant.planId);
      if (grant.purchasable) {
        expect(entry, `${grant.planId} is sold but not in CATALOG`).not.toBeNull();
      } else {
        // `free` must stay out of CATALOG, or a pricing panel would render it.
        expect(entry, `${grant.planId} is not sold and must not be in CATALOG`).toBeNull();
      }
    }
    expect(grantsFor(FALLBACK_PLAN_ID)?.purchasable).toBe(false);
  });

  it('grants strictly more the further up the ladder you pay', () => {
    const ladder = ['free', 'basic', 'pro', 'ultra'] as const;
    for (let i = 1; i < ladder.length; i += 1) {
      const lower = grantsFor(ladder[i - 1]!)!;
      const upper = grantsFor(ladder[i]!)!;
      for (const moduleId of lower.moduleIds) {
        expect(
          upper.moduleIds,
          `${upper.planId} must not drop ${moduleId} that ${lower.planId} grants`
        ).toContain(moduleId);
      }
      expect(upper.seats).toBeGreaterThanOrEqual(lower.seats);
      expect(upper.workspaces).toBeGreaterThanOrEqual(lower.workspaces);
      expect(upper.aiCreditsMonthly).toBeGreaterThanOrEqual(lower.aiCreditsMonthly);
    }
  });

  it('opens M6 on pro and ultra, M7 on ultra only', () => {
    // Owner decision, TASK-MTRIXGYXLLQR1: Pro keeps Evaluator Lens — the public
    // pricing page has sold it under Pro for months, and the cost is already
    // capped by the plan's 500 AI-credit ceiling.
    expect(plansGrantingModule('M6')).toEqual(['pro', 'ultra']);
    expect(plansGrantingModule('M7')).toEqual(['ultra']);
    expect(plansGrantingModule('M3')).toEqual(['basic', 'pro', 'ultra']);
    // The fallback plan grants M3 but is never a tier you can be gated up to.
    expect(plansGrantingModule('M3')).not.toContain('free');
  });

  it('retires every EUR plan id onto a plan that still exists', () => {
    for (const [retired, replacement] of Object.entries(RETIRED_PLAN_IDS)) {
      expect(grantsFor(replacement), `${retired} → ${replacement} is not a plan`).not.toBeNull();
      expect(resolvePlanId(retired)).toBe(replacement);
      expect(resolvePlanId(retired.toUpperCase())).toBe(replacement);
    }
  });

  it('never takes a module away from a migrated subscription', () => {
    // The EUR ladder's module sets, as they were the day it was retired
    // (prisma/migrations/retire-eur-plan-ladder.down.sql). Every one of them
    // must survive the mapping, or the migration silently downgraded a tenant.
    const retiredModules: Record<string, string[]> = {
      starter: ['M3', 'M5', 'M2'],
      team: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'],
      business: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8', 'M6', 'M9', 'M10', 'M11'],
      enterprise: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'],
    };
    for (const [retired, modules] of Object.entries(retiredModules)) {
      const replacement = grantsFor(retired)!;
      for (const moduleId of modules) {
        expect(
          replacement.moduleIds,
          `${retired} → ${replacement.planId} would lose ${moduleId}`
        ).toContain(moduleId);
      }
    }
  });

  it('leaves an unknown plan id alone so the caller fails loudly', () => {
    expect(resolvePlanId('platinum')).toBe('platinum');
    expect(grantsFor('platinum')).toBeNull();
  });
});

/**
 * Sentinel — TASK-MTRIXGYXLLQR1. `billingPanels.settings.plans.<id>.modules` is
 * marketing/settings copy typed by hand in two JSON files; nothing regenerates
 * it from `PLAN_GRANTS`. It had drifted before this task started: the Pro card
 * said "M1-M5, M8" a version behind the catalogue, which already granted M6.
 * This guards the two from silently diverging again, in either direction —
 * a card cannot promise a module the plan does not grant, and cannot grant one
 * the card does not mention, so the seats/credits/module figures a tenant
 * reads on the settings page are always exactly what `grantsFor()` computes.
 */
describe('plan card copy matches grantsFor() exactly (tr + en)', () => {
  const PLAN_IDS = ['basic', 'pro', 'ultra'] as const;

  /** "M1-M6, M8" / "M2, M3, M5" → ['M1','M2','M3','M4','M5','M6','M8'] */
  function parseModuleIds(label: string): string[] {
    const list = label.split(':')[1];
    if (!list) throw new Error(`No "label: list" split point in "${label}"`);
    const ids: string[] = [];
    for (const token of list.split(',').map((t) => t.trim())) {
      const range = token.match(/^M(\d+)-M(\d+)$/);
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        for (let n = from; n <= to; n += 1) ids.push(`M${n}`);
        continue;
      }
      if (!/^M\d+$/.test(token)) {
        throw new Error(`Unrecognised module token "${token}" in "${label}"`);
      }
      ids.push(token);
    }
    return ids;
  }

  /** Strips thousands separators (both "2.000" and "2,000") before reading the number. */
  function parseCount(label: string): number {
    const digitsOnly = label.replace(/[.,](?=\d{3}(\D|$))/g, '');
    const match = digitsOnly.match(/\d+/);
    if (!match) throw new Error(`No number found in "${label}"`);
    return Number(match[0]);
  }

  /** True only for wording that claims the figure is unlimited, in either locale. */
  function claimsUnlimited(label: string): boolean {
    return /sınırsız|unlimited/i.test(label);
  }

  for (const [locale, messages] of [
    ['tr', trMessages],
    ['en', enMessages],
  ] as const) {
    const cards = (messages as { billingPanels: { settings: { plans: Record<string, { seats: string; credits: string; modules: string }> } } })
      .billingPanels.settings.plans;

    for (const planId of PLAN_IDS) {
      const grant = grantsFor(planId)!;
      const card = cards[planId];

      it(`${locale}/${planId}: modules line names exactly grantsFor('${planId}').moduleIds`, () => {
        expect(card, `${locale} plan card missing for "${planId}"`).toBeDefined();
        const named = parseModuleIds(card.modules);
        const grantedSet = [...grant.moduleIds].sort();
        expect(
          [...named].sort(),
          `${locale}/${planId} modules line "${card.modules}" vs grant [${grantedSet.join(', ')}]`
        ).toEqual(grantedSet);
      });

      it(`${locale}/${planId}: seats/credits figures match grantsFor('${planId}')`, () => {
        expect(claimsUnlimited(card.seats) ? Infinity : parseCount(card.seats)).toBe(
          claimsUnlimited(card.seats) ? Infinity : grant.seats
        );
        expect(claimsUnlimited(card.credits) ? Infinity : parseCount(card.credits)).toBe(
          claimsUnlimited(card.credits) ? Infinity : grant.aiCreditsMonthly
        );
        // "sınırsız"/"unlimited" may only appear where the underlying number really has
        // no cap — this product has no such grant field today, so the wording must not
        // appear at all; the day a grant becomes a real sentinel-for-unlimited, this
        // assertion is the one to relax, not delete.
        expect(claimsUnlimited(card.seats), card.seats).toBe(false);
        expect(claimsUnlimited(card.credits), card.credits).toBe(false);
      });
    }
  }
});

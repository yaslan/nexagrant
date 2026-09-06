import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BETA_CHECKIN_TOTAL,
  CATALOGUE_LIST_CENTS,
  GA_DATE,
  PILOT_GRACE_DAYS,
  TRANSITION_TIERS,
  addDays,
  addMonths,
  resolveBetaTransition,
  resolveTier,
} from '@/lib/beta/pricing-transition';

describe('transition tiers', () => {
  it('ends in an unconditional tier so every partner gets an offer', () => {
    const last = TRANSITION_TIERS[TRANSITION_TIERS.length - 1];
    expect(last?.minCheckins).toBe(0);
    expect(last?.requiresG2).toBe(false);
    expect(resolveTier(0, false).tier).toBe(last?.tier);
  });

  it('orders the tiers so the strongest conditions win first', () => {
    const discounts = TRANSITION_TIERS.map((t) => t.discountPct);
    expect([...discounts].sort((a, b) => b - a)).toEqual(discounts);
  });

  it('needs both attendance and a G2 proposal for the founding tier', () => {
    expect(resolveTier(8, true).tier).toBe('founding');
    expect(resolveTier(8, false).tier).toBe('contributor'); // showed up, never ran the pipeline
    expect(resolveTier(4, true).tier).toBe('contributor'); // ran it, barely showed up
    expect(resolveTier(1, false).tier).toBe('alumni');
  });

  it('refuses an attendance count that cannot have happened', () => {
    expect(() => resolveTier(-1, true)).toThrow();
    expect(() => resolveTier(BETA_CHECKIN_TOTAL + 1, true)).toThrow();
    expect(() => resolveTier(2.5, true)).toThrow();
  });
});

describe('resolveBetaTransition', () => {
  const teamMonthly = CATALOGUE_LIST_CENTS['team']?.monthly ?? 0;

  it('applies the tier discount to the list price of the chosen cycle', () => {
    const offer = resolveBetaTransition({
      checkinsAttended: 6,
      reachedG2: true,
      planId: 'team',
      listCents: teamMonthly,
      cycle: 'monthly',
    });
    expect(offer.tier).toBe('founding');
    expect(offer.discountPct).toBe(40);
    expect(offer.payableCents).toBe(14940); // €249 − 40%
    expect(offer.savingCents).toBe(teamMonthly - 14940);
  });

  it('does not compound the annual list discount with the cohort discount', () => {
    const annualList = CATALOGUE_LIST_CENTS['team']?.annual ?? 0;
    const offer = resolveBetaTransition({
      checkinsAttended: 6,
      reachedG2: true,
      planId: 'team',
      listCents: annualList,
      cycle: 'annual',
    });
    // 40% off the already-annualised €2,390 — not 40% off 12 × the discounted month.
    expect(offer.payableCents).toBe(Math.round(annualList * 0.6));
    expect(offer.payableCents).not.toBe(14940 * 12);
  });

  it('dates the discount, the price lock and the pilot grace from GA', () => {
    const offer = resolveBetaTransition({
      checkinsAttended: 8,
      reachedG2: true,
      planId: 'team',
      listCents: teamMonthly,
      cycle: 'monthly',
      gaDate: '2026-11-16',
    });
    expect(offer.discountEndsOn).toBe('2027-11-16');
    expect(offer.priceLockEndsOn).toBe('2028-11-16');
    expect(offer.pilotGraceEndsOn).toBe(addDays('2026-11-16', PILOT_GRACE_DAYS));
  });

  it('gives the alumni tier no price lock at all', () => {
    const offer = resolveBetaTransition({
      checkinsAttended: 0,
      reachedG2: false,
      planId: 'starter',
      listCents: CATALOGUE_LIST_CENTS['starter']?.monthly ?? 0,
      cycle: 'monthly',
    });
    expect(offer.tier).toBe('alumni');
    expect(offer.priceLockEndsOn).toBeNull();
    expect(offer.welcomeCredits).toBe(0);
  });

  it('leaves a free plan free rather than inventing a negative price', () => {
    const offer = resolveBetaTransition({
      checkinsAttended: 8,
      reachedG2: true,
      planId: 'free',
      listCents: 0,
      cycle: 'monthly',
    });
    expect(offer.payableCents).toBe(0);
    expect(offer.savingCents).toBe(0);
  });

  it('refuses a price that is not a whole number of cents', () => {
    const bad = { checkinsAttended: 8, reachedG2: true, planId: 'team', cycle: 'monthly' } as const;
    expect(() => resolveBetaTransition({ ...bad, listCents: 249.5 })).toThrow(/whole number/);
    expect(() => resolveBetaTransition({ ...bad, listCents: -1 })).toThrow();
  });

  it('refuses a GA date that is not a real date', () => {
    expect(() =>
      resolveBetaTransition({
        checkinsAttended: 8,
        reachedG2: true,
        planId: 'team',
        listCents: teamMonthly,
        cycle: 'monthly',
        gaDate: '16/11/2026',
      })
    ).toThrow(/yyyy-mm-dd/);
  });
});

describe('date arithmetic', () => {
  it('clamps a month shift onto a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap year
    expect(addMonths('2026-11-16', 24)).toBe('2028-11-16');
  });

  it('crosses a year boundary by days', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('catalogue prices', () => {
  // The offer maths must stay pure, so the plan prices are duplicated out of
  // prisma/seed.ts. This test is the only thing stopping the duplicate from rotting.
  it('agrees with the plan rows seeded in prisma/seed.ts', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../prisma/seed.ts'), 'utf8');
    const seeded = new Map<string, { monthly: number; annual: number }>();
    const pattern = /\{\s*id:\s*'([a-z]+)',[^}]*?monthlyCents:\s*(\d+),\s*yearlyCents:\s*(\d+)/g;
    for (const match of seed.matchAll(pattern)) {
      const [, id, monthly, annual] = match;
      if (id && monthly && annual) seeded.set(id, { monthly: Number(monthly), annual: Number(annual) });
    }
    expect(seeded.size).toBeGreaterThan(0);
    for (const [id, prices] of seeded) {
      expect(CATALOGUE_LIST_CENTS[id], `plan "${id}" is seeded but missing from CATALOGUE_LIST_CENTS`).toEqual(
        prices
      );
    }
  });

  it('anchors the survey ladder on the seeded Team price', () => {
    expect(CATALOGUE_LIST_CENTS['team']?.monthly).toBe(24900);
  });

  it('starts general availability after the beta closes', () => {
    expect(new Date(`${GA_DATE}T00:00:00Z`).getTime()).toBeGreaterThan(new Date('2026-10-29T00:00:00Z').getTime());
  });
});

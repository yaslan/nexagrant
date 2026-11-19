/** NG-57 — the shapes the billing actions return (NG-11 contract), from the seed catalogue. */
import { describe, expect, it } from 'vitest';
import {
  NG_PLANS,
  NG_PLAN_FEATURES,
  NG_PLAN_PRICES,
  NG_TRIAL_POLICIES,
} from '../../../../prisma/seed-data/nexagrant-catalog';
import { entitlementFor } from './entitlement';
import { billingStateView, catalogView } from './view';

const catalog = {
  plans: [...NG_PLANS],
  features: [...NG_PLAN_FEATURES],
  prices: [...NG_PLAN_PRICES],
  trialPolicies: [...NG_TRIAL_POLICIES],
};

describe('NG-57 catalogView', () => {
  it('lists the plans in order with their granted features only, and no purchasable price', () => {
    const v = catalogView(catalog);
    expect(v.plans.map((p) => p.id)).toEqual(['ng-free', 'ng-basic', 'ng-pro', 'ng-enterprise']);
    const free = v.plans[0]!;
    expect(free.features).toEqual([
      { key: 'org_profile', limit: null },
      { key: 'eligibility_check', limit: 3 },
      { key: 'seats', limit: 1 },
    ]);
    expect(free.prices).toHaveLength(4);
    expect(v.plans.flatMap((p) => p.prices).every((o) => !o.purchasable && o.amountMinor === null)).toBe(true);
    expect(v.trialPolicies).toHaveLength(2);
  });

  it('is plain JSON (survives the server-action boundary unchanged)', () => {
    const v = catalogView(catalog);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe('NG-57 billingStateView', () => {
  const plan = NG_PLANS.find((p) => p.id === 'ng-pro')!;
  it('serialises a running trial with ISO dates', () => {
    const v = billingStateView({
      tenantId: 't',
      plan,
      source: 'subscription',
      status: 'TRIALING',
      entitlement: entitlementFor('ng-pro', NG_PLAN_FEATURES),
      trial: {
        kind: 'running',
        segment: 'default',
        startedAt: new Date('2026-11-18T10:00:00Z'),
        endsAt: new Date('2026-12-01T21:00:00Z'),
        daysLeft: 14,
        endPlanId: 'ng-free',
      },
    });
    expect(v).toMatchObject({ planId: 'ng-pro', tier: 'professional', source: 'subscription', status: 'TRIALING' });
    expect(v.trial).toEqual({
      kind: 'running',
      segment: 'default',
      startedAt: '2026-11-18T10:00:00.000Z',
      endsAt: '2026-12-01T21:00:00.000Z',
      daysLeft: 14,
      endPlanId: 'ng-free',
    });
    expect(v.features.find((f) => f.key === 'ai_writing_monthly')).toEqual({ key: 'ai_writing_monthly', limit: 50 });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

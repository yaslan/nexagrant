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

/**
 * NG-250 — contract additions (additive, NG-57 crw2 §"NG-11 sunucu sözleşmesi"): who may buy
 * (`canManageBilling`), what is used against each counted limit (`usage`), and a typed status.
 */
describe('NG-250 billingStateView additions', () => {
  const plan = NG_PLANS.find((p) => p.id === 'ng-pro')!;
  const state = {
    tenantId: 't',
    plan,
    source: 'subscription' as const,
    status: 'TRIALING' as const,
    entitlement: entitlementFor('ng-pro', NG_PLAN_FEATURES),
    trial: { kind: 'none' as const },
  };
  const usage = {
    seats: { used: 2, limit: 5 },
    aiWritingMonthly: { used: 7, limit: 50, periodStart: new Date('2026-10-31T21:00:00Z') },
  };

  it('canManageBilling follows can(role, manage_billing)', () => {
    expect(billingStateView(state, { role: 'TENANT_OWNER', usage }).canManageBilling).toBe(true);
    expect(billingStateView(state, { role: 'TENANT_ADMIN', usage }).canManageBilling).toBe(false);
    expect(billingStateView(state, { role: 'MEMBER', usage }).canManageBilling).toBe(false);
    expect(billingStateView(state, { role: null, usage }).canManageBilling).toBe(false);
  });

  it('usage carries used and limit per counter, ISO period start, plain JSON', () => {
    const v = billingStateView(state, { role: 'TENANT_OWNER', usage });
    expect(v.usage).toEqual({
      seats: { used: 2, limit: 5 },
      aiWritingMonthly: { used: 7, limit: 50, periodStart: '2026-10-31T21:00:00.000Z' },
    });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('status is the SubStatus union (a type check: an unknown status does not compile)', () => {
    const v = billingStateView(state, { role: 'TENANT_OWNER', usage });
    const s: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'PAUSED' = v.status;
    expect(s).toBe('TRIALING');
  });
});

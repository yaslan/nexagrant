import { describe, expect, it } from 'vitest';
import {
  grantFromPlanVersion,
  planVersionRefusal,
  type SubscribedPlanVersion,
} from './entitlement-source';

/**
 * TASK-MTSJH8NMAXPRM — which row decides a tenant's limits.
 *
 * The defect these guard: `getEntitlements` read `PLAN_GRANTS`, a compiled
 * constant, so the plan studio could publish Pro at 10 seats and every Pro
 * tenant still had 6. Measured against the running database on 2026-09-08:
 * publishing `pro` v2 with `seats: 10` left `getEntitlements('demo-tenant')`
 * answering `seats=6`.
 *
 * The rule has to say yes to the version *and* say no to two specific pointers,
 * so both halves are asserted. A test that only proved "the version wins" would
 * pass on a function that never refuses anything.
 */
function version(overrides: Partial<SubscribedPlanVersion> = {}): SubscribedPlanVersion {
  return {
    id: 'pv_pro_2',
    planId: 'pro',
    version: 2,
    status: 'published',
    seats: 10,
    workspaces: 3,
    aiCreditsMonthly: 900,
    modules: ['M1', 'M2', 'M6'],
    ...overrides,
  };
}

describe('grantFromPlanVersion', () => {
  it('takes the published version the subscription points at', () => {
    const resolved = grantFromPlanVersion('pro', version());
    expect(resolved).not.toBeNull();
    expect(resolved!.grant).toEqual({
      seats: 10,
      workspaces: 3,
      aiCreditsMonthly: 900,
      moduleIds: ['M1', 'M2', 'M6'],
    });
    expect(resolved!.versionId).toBe('pv_pro_2');
    expect(resolved!.version).toBe(2);
  });

  it('takes an archived version too — that is a tenant left on old terms', () => {
    // Archived is what the *previous* published version becomes. A subscription
    // still pointing at it bought under those terms, and the immutable history
    // exists precisely so it can keep them.
    const resolved = grantFromPlanVersion('pro', version({ status: 'archived', seats: 6 }));
    expect(resolved?.grant.seats).toBe(6);
  });

  it('refuses a draft — nothing was ever sold under one', () => {
    expect(grantFromPlanVersion('pro', version({ status: 'draft' }))).toBeNull();
    expect(planVersionRefusal('pro', version({ status: 'draft' }))).toBe('draft');
  });

  it('refuses a version belonging to another plan', () => {
    // A plan change that did not update the column would otherwise entitle a
    // Basic subscriber from a Pro version.
    expect(grantFromPlanVersion('basic', version())).toBeNull();
    expect(planVersionRefusal('basic', version())).toBe('wrong-plan');
  });

  it('has nothing to say when there is no version', () => {
    expect(grantFromPlanVersion('pro', null)).toBeNull();
    expect(grantFromPlanVersion('pro', undefined)).toBeNull();
  });

  it('accepts a version reached through a retired plan id, once resolved', () => {
    // `team` sits on old subscriptions; `resolvePlanId` turns it into `pro`
    // before this function sees it, and the version carries `pro`.
    expect(grantFromPlanVersion('pro', version())).not.toBeNull();
    // The unresolved id must NOT match, or the resolution step would be
    // decorative.
    expect(grantFromPlanVersion('team', version())).toBeNull();
  });

  it('reports no refusal for a good pointer', () => {
    expect(planVersionRefusal('pro', version())).toBeNull();
  });
});

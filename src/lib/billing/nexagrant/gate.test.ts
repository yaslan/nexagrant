/**
 * NG-250 — the NexaGrant plan gate on product routes (pure half).
 *
 *   - K-584603 = A: a tenant with no `NgSubscription` row is not a NexaGrant tenant; the gate
 *     lets it through and the route's own (platform plan, module, role) checks stand.
 *   - An enrolled tenant whose plan does not grant the feature is refused with a fixed code.
 *   - The module behind a feature (NG_FEATURE_MODULE) closes it when its switch is closed,
 *     even when the plan grants it (CLAUDE.md rule 4, review U5).
 *   - Only TRIALING and ACTIVE rows carry their plan; any other status reads as the fallback
 *     plan (review U3).
 */
import { describe, expect, it } from 'vitest';
import type { TenantTx } from '@/lib/db';
import { NG_FEATURE_MODULE } from './authz';
import { NG_GATE_CODES, ngFeatureGate } from './gate';
import { readNgBillingState } from './repository';

const PLANS: Record<string, { id: string; tier: string; sortOrder: number; sellable: boolean; isFallback: boolean }> = {
  'ng-free': { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
  'ng-pro': { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false },
};
const FEATURES: Record<string, string[]> = {
  'ng-free': ['org_profile', 'eligibility_check', 'seats'],
  'ng-pro': ['org_profile', 'eligibility_check', 'call_search', 'partner_search', 'similar_projects', 'seats'],
};

function fakeTx(sub: Record<string, unknown> | null, moduleStatus: string | null = 'ON'): TenantTx {
  return {
    ngSubscription: { findUnique: async () => sub },
    ngPlan: {
      findUnique: async ({ where }: { where: { id: string } }) => PLANS[where.id] ?? null,
      findFirst: async () => PLANS['ng-free'],
    },
    ngPlanFeature: {
      findMany: async ({ where }: { where: { planId: string } }) =>
        (FEATURES[where.planId] ?? []).map((featureKey) => ({ planId: where.planId, featureKey, limitValue: null })),
    },
    moduleState: { findUnique: async () => (moduleStatus ? { status: moduleStatus } : null) },
  } as unknown as TenantTx;
}

const NOW = new Date('2026-11-19T09:00:00Z');
const RUNNING = {
  tenantId: 't1',
  planId: 'ng-pro',
  status: 'TRIALING',
  provider: 'ng-trial',
  trialSegment: 'default',
  trialStartedAt: new Date('2026-11-10T09:00:00Z'),
  trialEndsAt: new Date('2026-11-24T21:00:00Z'),
  trialEndPlanId: 'ng-free',
  trialEndedAt: null,
};
const ENDED = { ...RUNNING, trialEndsAt: new Date('2026-11-18T21:00:00Z') };
const OWNER = { tenantId: 't1', role: 'TENANT_OWNER' as const };

describe('ngFeatureGate (NG-250)', () => {
  it('K-584603 = A: a tenant without a NexaGrant row passes, marked not enrolled', async () => {
    const d = await ngFeatureGate(fakeTx(null), OWNER, 'search_calls', 'call_search', NOW);
    expect(d).toEqual({ allowed: true, enrolled: false });
  });

  it('a running trial (ng-pro) opens call search', async () => {
    const d = await ngFeatureGate(fakeTx(RUNNING), OWNER, 'search_calls', 'call_search', NOW);
    expect(d).toEqual({ allowed: true, enrolled: true });
  });

  it('after the trial end the same request is refused with NG_FEATURE_NOT_IN_PLAN', async () => {
    const d = await ngFeatureGate(fakeTx(ENDED), OWNER, 'search_calls', 'call_search', NOW);
    expect(d).toEqual({ allowed: false, code: NG_GATE_CODES.notInPlan, feature: 'call_search' });
  });

  it('a role without the action is refused with NG_ROLE_FORBIDDEN, before the plan', async () => {
    const d = await ngFeatureGate(
      fakeTx(RUNNING),
      { tenantId: 't1', role: 'GUEST_PARTNER' },
      'view_partner_search',
      'partner_search',
      NOW
    );
    expect(d).toEqual({ allowed: false, code: NG_GATE_CODES.roleForbidden, feature: 'partner_search' });
  });

  it('no role at all is refused', async () => {
    const d = await ngFeatureGate(fakeTx(null), { tenantId: 't1', role: null }, 'search_calls', 'call_search', NOW);
    expect(d.allowed).toBe(false);
  });

  it('U5: partner search is behind M1 — the plan grants it but a closed M1 refuses it', async () => {
    expect(NG_FEATURE_MODULE.partner_search).toBe('M1');
    const closed = await ngFeatureGate(fakeTx(RUNNING, 'OFF'), OWNER, 'view_partner_search', 'partner_search', NOW);
    expect(closed).toEqual({ allowed: false, code: NG_GATE_CODES.moduleClosed, feature: 'partner_search' });
    const noRow = await ngFeatureGate(fakeTx(RUNNING, null), OWNER, 'view_partner_search', 'partner_search', NOW);
    expect(noRow.allowed).toBe(false);
    const open = await ngFeatureGate(fakeTx(RUNNING, 'ON'), OWNER, 'view_partner_search', 'partner_search', NOW);
    expect(open).toEqual({ allowed: true, enrolled: true });
  });

  it.each(['CANCELED', 'PAST_DUE', 'PAUSED'])('U3: a %s ng-pro row is on the fallback plan, not Pro', async (status) => {
    const row = { ...RUNNING, status, provider: 'manual', trialEndedAt: new Date('2026-11-01T00:00:00Z') };
    const state = await readNgBillingState(fakeTx(row), 't1', NOW);
    expect(state.plan.id).toBe('ng-free');
    expect(state.source).toBe('subscription');
    expect(state.status).toBe(status);
    const d = await ngFeatureGate(fakeTx(row), OWNER, 'search_calls', 'call_search', NOW);
    expect(d).toEqual({ allowed: false, code: NG_GATE_CODES.notInPlan, feature: 'call_search' });
  });

  it('U3: an ACTIVE ng-pro row keeps Pro (Ö3: ACTIVE with trialEndedAt null is not a trial)', async () => {
    const row = { ...RUNNING, status: 'ACTIVE', provider: 'manual', trialEndedAt: null };
    const state = await readNgBillingState(fakeTx(row), 't1', NOW);
    expect(state.plan.id).toBe('ng-pro');
    expect(state.trial.kind).toBe('ended');
    const d = await ngFeatureGate(fakeTx(row), OWNER, 'search_calls', 'call_search', NOW);
    expect(d).toEqual({ allowed: true, enrolled: true });
  });
});

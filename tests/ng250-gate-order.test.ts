/**
 * NG-250 (round 7) — the order of the doors on the Partner Search session routes:
 *
 *     role door → module door → NexaGrant plan gate → readers
 *
 * The role and module doors are the routes' own (src/modules/m1/server/partner-search/http.ts,
 * NG-64 / FO-61): a caller they refuse gets exactly the body dev gives today,
 * `{ error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'ROLE_FORBIDDEN' | 'MODULE_OFF' }`
 * (tests/e2e/role-gate.spec.ts pins the guest case). Only a caller both doors let on can meet
 * the plan gate, which answers `{ error: 'Forbidden', code: 'NG_FEATURE_NOT_IN_PLAN', … }` —
 * still before any announcement is read or a quota unit is spent (review 4, finding A).
 *
 * The plan gate is the real one (gate.ts → authz.ts → repository.ts); only the edges are
 * replaced: the session, the platform plan (`getEntitlements`) and the transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sub = Record<string, unknown> | null;

const h = vi.hoisted(() => ({
  tenantId: 'tenant-ng250-order',
  role: 'TENANT_OWNER',
  m1Status: 'ON' as string | null,
  sub: null as Record<string, unknown> | null,
  calls: { reads: 0, quota: 0 },
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => ({
    ok: true,
    scope: { tenantId: h.tenantId, userId: 'user-ng250-order', role: h.role, workspaceIds: [], isPlatformAdmin: false },
  }),
}));

// The platform plan: Ultra, so the platform's own grant (and the export) never refuses here.
vi.mock('@/lib/billing', () => ({
  getEntitlements: async () => ({ planId: 'ultra', allowedModules: ['M1', 'M2', 'M3', 'M5'] }),
}));

const PLANS: Record<string, { id: string; tier: string; sortOrder: number; sellable: boolean; isFallback: boolean }> = {
  'ng-free': { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
  'ng-pro': { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false },
};
const FEATURES: Record<string, string[]> = {
  'ng-free': ['org_profile', 'eligibility_check', 'seats'],
  'ng-pro': ['org_profile', 'eligibility_check', 'call_search', 'partner_search', 'similar_projects', 'seats'],
};

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: async <T,>(tenantId: string, callback: (tx: never) => Promise<T>): Promise<T> => {
      expect(tenantId).toBe(h.tenantId);
      const tx = {
        moduleState: { findUnique: async () => (h.m1Status === null ? null : { status: h.m1Status }) },
        ngSubscription: { findUnique: async () => h.sub },
        ngPlan: {
          findUnique: async ({ where }: { where: { id: string } }) => PLANS[where.id] ?? null,
          findFirst: async () => PLANS['ng-free'],
        },
        ngPlanFeature: {
          findMany: async ({ where }: { where: { planId: string } }) =>
            (FEATURES[where.planId] ?? []).map((featureKey) => ({ planId: where.planId, featureKey, limitValue: null })),
        },
        partnerSearchAnnouncement: {
          count: async () => {
            h.calls.reads += 1;
            return 0;
          },
          findMany: async () => {
            h.calls.reads += 1;
            return [];
          },
        },
        $queryRaw: async () => {
          h.calls.quota += 1;
          return [{ count: 1 }];
        },
      };
      return callback(tx as never);
    },
  };
});

const { GET: listRoute } = await import('@/app/api/partner-search/announcements/route');
const { GET: exportRoute } = await import('@/app/api/partner-search/announcements/export/route');
const { GET: orgRoute } = await import('@/app/api/organizations/[pic]/announcements/route');
const { GET: signalRoute } = await import('@/app/api/topics/[identifier]/partner-signal/route');

const NOW = new Date('2026-11-19T09:00:00Z');
const TOPIC = 'HORIZON-CL4-2026-RESILIENCE-01-12';
const PIC = '999111001';
const req = (p: string) => new Request(`http://localhost${p}`);

const ROUTES: ReadonlyArray<readonly [string, () => Promise<Response>]> = [
  ['/api/partner-search/announcements', () => listRoute(req('/api/partner-search/announcements'))],
  ['/api/partner-search/announcements/export', () => exportRoute(req('/api/partner-search/announcements/export?format=json'))],
  [
    '/api/organizations/[pic]/announcements',
    () => orgRoute(req(`/api/organizations/${PIC}/announcements`), { params: Promise.resolve({ pic: PIC }) }),
  ],
  [
    '/api/topics/[identifier]/partner-signal',
    () => signalRoute(req(`/api/topics/${TOPIC}/partner-signal`), { params: Promise.resolve({ identifier: TOPIC }) }),
  ],
];

const RUNNING: Sub = {
  tenantId: h.tenantId,
  planId: 'ng-pro',
  status: 'TRIALING',
  provider: 'ng-trial',
  trialSegment: 'default',
  trialStartedAt: new Date('2026-11-10T09:00:00Z'),
  trialEndsAt: new Date('2026-11-24T21:00:00Z'),
  trialEndPlanId: 'ng-free',
  trialEndedAt: null,
};
const ENDED: Sub = { ...RUNNING, trialEndsAt: new Date('2026-11-18T21:00:00Z') };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  h.role = 'TENANT_OWNER';
  h.m1Status = 'ON';
  h.sub = null;
  h.calls = { reads: 0, quota: 0 };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NG-250 r7: a role the route refuses gets the NG-64 body, enrolled or not', () => {
  it.each(ROUTES)('%s — GUEST_PARTNER, tenant with no NexaGrant row (K-584603 = A)', async (_p, call) => {
    h.role = 'GUEST_PARTNER';
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'ROLE_FORBIDDEN' });
    expect(h.calls).toEqual({ reads: 0, quota: 0 });
  });

  it.each(ROUTES)('%s — GUEST_PARTNER, tenant on a running NexaGrant trial', async (_p, call) => {
    h.role = 'GUEST_PARTNER';
    h.sub = RUNNING;
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'ROLE_FORBIDDEN' });
    expect(h.calls).toEqual({ reads: 0, quota: 0 });
  });
});

describe('NG-250 r7: a closed module answers as the module door, before the plan (CLAUDE.md rule 4)', () => {
  it.each(ROUTES)('%s — TENANT_OWNER, M1 OFF, plan grants partner_search → MODULE_OFF', async (_p, call) => {
    h.sub = RUNNING;
    h.m1Status = 'OFF';
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'MODULE_OFF' });
    expect(h.calls).toEqual({ reads: 0, quota: 0 });
  });
});

describe('NG-250 r7: the plan gate answers only the caller both doors let on, before any read', () => {
  it.each(ROUTES)('%s — TENANT_OWNER, trial ended → NG_FEATURE_NOT_IN_PLAN, nothing read, no quota unit', async (_p, call) => {
    h.sub = ENDED;
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden', code: 'NG_FEATURE_NOT_IN_PLAN', feature: 'partner_search' });
    expect(h.calls).toEqual({ reads: 0, quota: 0 });
  });

  it.each(ROUTES)('%s — TENANT_OWNER, trial running → 200 (control)', async (_p, call) => {
    h.sub = RUNNING;
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.calls.reads).toBeGreaterThan(0);
  });
});

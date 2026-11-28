/**
 * NG-272 review B-2 and B-3.
 *
 * B-3: `authenticateApiKey` must CALL `ngFeatureGate` when the route passes a feature. The
 * bindings test only checks that the literal is written in the route file; this one checks
 * the door runs the gate (mutant: `if (false && ng)` must turn it red). The database is
 * faked; the live suite (tests/api-ng-key-gate.live.test.ts) proves the same on Postgres.
 *
 * B-2: a key route's feature must not sit behind a module other than the one the key door
 * checks (M1). The key door does not open any other module, so a feature behind e.g. M8 would
 * be silently let through.
 */
import crypto from 'crypto';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { SYSTEM_ROLE } from '@/lib/rbac';
import { NG_FEATURE_MODULE } from '@/lib/billing/nexagrant/authz';
import { NG_KEY_ROUTES } from '@/lib/billing/nexagrant/bindings';
import { PARTNER_API_MODULE } from '@/lib/api-auth';

const KEY = 'fp_live_ng_gate_call_0001';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');

const gate = vi.hoisted(() => ({ ngFeatureGate: vi.fn() }));

vi.mock('@/lib/billing/nexagrant/gate', () => ({ ngFeatureGate: gate.ngFeatureGate }));
vi.mock('@/lib/modules/tenant-access', () => ({
  checkModuleAccessForTenant: vi.fn(async () => ({ allowed: true, status: 'ON' })),
}));
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async <T,>(_p: string, _c: string, cb: (tx: unknown) => Promise<T>) =>
    cb({
      apiKey: {
        findUnique: async ({ where }: { where: { keyHash: string } }) =>
          where.keyHash === HASH ? { id: 'k-ng', tenantId: 't-ng', name: 'unit' } : null,
      },
    }),
}));
vi.mock('@/lib/db', () => ({
  // The rate-limit counter is the first withTenant call; the gate is the second. Both get the
  // same fake transaction: the counter says "well under the limit", the gate returns its mock.
  withTenant: async <T,>(_t: string, cb: (tx: unknown) => Promise<T>) =>
    cb({ $queryRaw: async () => [{ count: 1, windowStartedAt: new Date() }] }),
}));

import { authenticateApiKey } from '@/lib/api-auth';

const ACTION = 'view_partner_search' as const;

function call(ng: Parameters<typeof authenticateApiKey>[1]) {
  return authenticateApiKey(
    new Request('http://localhost/api/v1/partners', { headers: { 'x-api-key': KEY } }),
    ng
  );
}

beforeEach(() => {
  gate.ngFeatureGate.mockReset();
});

describe('NG-272 B-3: authenticateApiKey runs the NexaGrant gate when a feature is passed', () => {
  test('calls ngFeatureGate once with the key tenant, SYSTEM_ROLE, the action and the feature', async () => {
    gate.ngFeatureGate.mockResolvedValue({ allowed: true });
    const res = await call({ action: ACTION, feature: 'partner_search' });

    expect(res.authenticated).toBe(true);
    expect(gate.ngFeatureGate).toHaveBeenCalledTimes(1);
    const args = gate.ngFeatureGate.mock.calls[0];
    expect(args?.[1]).toEqual({ tenantId: 't-ng', role: SYSTEM_ROLE });
    expect(args?.[2]).toBe(ACTION);
    expect(args?.[3]).toBe('partner_search');
  });

  test('a refusal from the gate is a 403 carrying the gate code and feature', async () => {
    gate.ngFeatureGate.mockResolvedValue({
      allowed: false,
      code: 'NG_FEATURE_NOT_IN_PLAN',
      feature: 'partner_search',
    });
    const res = await call({ action: ACTION, feature: 'partner_search' });

    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
    expect(await res.errorResponse.json()).toEqual({
      error: 'Forbidden',
      code: 'NG_FEATURE_NOT_IN_PLAN',
      feature: 'partner_search',
    });
  });

  test('a route with no feature (ng null) does not ask the gate', async () => {
    const res = await call(null);

    expect(res.authenticated).toBe(true);
    expect(gate.ngFeatureGate).not.toHaveBeenCalled();
  });
});

describe('NG-272 B-2: a key route feature is behind no module other than the key door module', () => {
  test('every NG_KEY_ROUTES feature is unmoduled or behind PARTNER_API_MODULE', () => {
    for (const route of NG_KEY_ROUTES) {
      if (!route.feature) continue;
      const moduleId = NG_FEATURE_MODULE[route.feature];
      expect(
        moduleId === undefined || moduleId === PARTNER_API_MODULE,
        `${route.file}: ${route.feature} is behind ${moduleId}, the key door only checks ${PARTNER_API_MODULE}`
      ).toBe(true);
    }
  });
});

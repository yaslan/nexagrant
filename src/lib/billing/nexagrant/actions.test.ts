/**
 * NG-11 B1 / F1 — the server action's own door. The page refuses a role before it reads
 * (tests/e2e/ng11-plan-trial.spec.ts), but the action is callable on its own, so it must
 * refuse too: a role without NG_PLAN_VIEW_ACTION gets ForbiddenRoleError and the
 * subscription is never read. `requireTenantAction` is the real one (only `auth()` is
 * stubbed), so removing the `can:` condition in actions.ts turns these tests red.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { m } = vi.hoisted(() => ({
  m: { session: null as Record<string, unknown> | null },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));
vi.mock('@/lib/db', () => ({
  withTenant: (_tenantId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock('./repository', () => ({ readNgBillingState: vi.fn() }));

import { ForbiddenRoleError } from '@/lib/tenant';
import { getNgBillingStateAction } from './actions';
import { readNgBillingState } from './repository';
import { entitlementFor } from './entitlement';

const readMock = vi.mocked(readNgBillingState);

const FREE_STATE = {
  tenantId: 't1',
  plan: { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
  source: 'fallback' as const,
  status: 'ACTIVE' as const,
  entitlement: entitlementFor('ng-free', []),
  trial: { kind: 'none' as const },
};

beforeEach(() => {
  m.session = null;
  readMock.mockReset();
  readMock.mockResolvedValue(FREE_STATE);
});

function sessionAs(role: string) {
  m.session = { user: { id: 'u1' }, tenantId: 't1', role, workspaceIds: [], isPlatformAdmin: false };
}

describe('getNgBillingStateAction — role door (NG-11 B1, K-584303 = A)', () => {
  test.each(['MEMBER', 'GUEST_PARTNER'])('%s is refused with ForbiddenRoleError and nothing is read', async (role) => {
    sessionAs(role);
    await expect(getNgBillingStateAction()).rejects.toBeInstanceOf(ForbiddenRoleError);
    expect(readMock).not.toHaveBeenCalled();
  });

  test('TENANT_OWNER gets the tenant plan view', async () => {
    sessionAs('TENANT_OWNER');
    const view = await getNgBillingStateAction();
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(view)).toContain('ng-free');
  });
});

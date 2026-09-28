import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTQZ8MVAU3J7I — the plan half of the module gate.
 *
 * CLAUDE.md §4: "a module may be `on` and still be unusable when the plan does not
 * cover it". Before this, `checkModuleAccess` read `ModuleState` and nothing else,
 * so a tenant on `pro` (catalogue grant M1/M2/M3/M4/M5/M8) whose `ModuleState` row
 * for M10 said `ON` — exactly the state the demo tenant was in — used M10 for free.
 *
 * The three cases the gate has to separate, all with the *same* viewer:
 *   plan covers + ON  → allowed
 *   plan misses + ON  → refused, PLAN_UPGRADE_REQUIRED   ← the bug
 *   plan covers + OFF → refused, MODULE_OFF              ← status still binds
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  moduleStateFindUnique: vi.fn(),
  getEntitlements: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: h.auth }));

vi.mock('@/lib/db', () => ({
  prisma: { moduleState: { findUnique: h.moduleStateFindUnique } },
  // The gate reads its ModuleState row inside a tenant scope as of
  // TASK-MTVR9T834EPUC. `as never` hands the fake client to a callback typed
  // against the real TenantTx without widening either side to `any`.
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb({ moduleState: { findUnique: h.moduleStateFindUnique } } as never),
}));

vi.mock('@/lib/billing', () => ({ getEntitlements: h.getEntitlements }));

import { checkModuleAccess, assertModuleAccess, ModuleAccessError } from '@/lib/modules/access';

/** A plain tenant member — no platform-admin or manager bypass in play. */
const SESSION = {
  user: { id: 'user-1' },
  tenantId: 'tenant-1',
  role: 'MEMBER',
  workspaceIds: ['ws-1'],
  isPlatformAdmin: false,
};

/** Everything a `pro` tenant is entitled to, per PLAN_GRANTS. M10 is not in it. */
const PRO_MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'];

function arrange(opts: { status: string | null; allowedModules: string[] }) {
  h.auth.mockResolvedValue(SESSION);
  h.moduleStateFindUnique.mockResolvedValue(
    opts.status === null ? null : { status: opts.status },
  );
  h.getEntitlements.mockResolvedValue({
    allowedModules: opts.allowedModules,
    seats: 6,
    workspaces: 1,
    aiCreditsMonthly: 500,
  });
}

describe('checkModuleAccess — plan entitlement and module status together', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows when the plan covers the module and it is ON', async () => {
    arrange({ status: 'ON', allowedModules: PRO_MODULES });

    const access = await checkModuleAccess('M8');

    expect(access.allowed).toBe(true);
    expect(access.status).toBe('ON');
    expect(access.reason).toBeUndefined();
  });

  it('refuses when the module is ON but the plan does not cover it', async () => {
    // The live demo-tenant state: plan `pro`, ModuleState M10 = ON.
    arrange({ status: 'ON', allowedModules: PRO_MODULES });

    const access = await checkModuleAccess('M10');

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('PLAN_UPGRADE_REQUIRED');
    // The status is reported truthfully — the module *is* on; it is just not owned.
    expect(access.status).toBe('ON');
    // Which plans do sell it comes from PLAN_GRANTS, so the copy cannot drift.
    expect(access.requiredPlans).toEqual(['Ultra']);
  });

  it('refuses when the plan covers the module but it is OFF', async () => {
    arrange({ status: 'OFF', allowedModules: PRO_MODULES });

    const access = await checkModuleAccess('M8');

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('MODULE_OFF');
  });

  it('treats a missing ModuleState row as OFF, not as an entitlement', async () => {
    arrange({ status: null, allowedModules: PRO_MODULES });

    const access = await checkModuleAccess('M8');

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('MODULE_OFF');
  });

  it('refuses a session with no tenant without reading the plan at all', async () => {
    h.auth.mockResolvedValue(null);

    const access = await checkModuleAccess('M8');

    expect(access).toEqual({ allowed: false, status: 'OFF', reason: 'NO_TENANT' });
    expect(h.getEntitlements).not.toHaveBeenCalled();
  });

  it('binds a platform admin too: entitlement is not a status bypass', async () => {
    h.auth.mockResolvedValue({ ...SESSION, isPlatformAdmin: true, role: 'TENANT_OWNER' });
    h.moduleStateFindUnique.mockResolvedValue({ status: 'ON' });
    h.getEntitlements.mockResolvedValue({
      allowedModules: PRO_MODULES,
      seats: 6,
      workspaces: 1,
      aiCreditsMonthly: 500,
    });

    const access = await checkModuleAccess('M10');

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('reads the entitlement for the session tenant, never an argument', async () => {
    arrange({ status: 'ON', allowedModules: PRO_MODULES });

    await checkModuleAccess('M8');

    expect(h.getEntitlements).toHaveBeenCalledWith('tenant-1', expect.any(Object));
    expect(h.moduleStateFindUnique).toHaveBeenCalledWith({
      where: { tenantId_moduleId: { tenantId: 'tenant-1', moduleId: 'M8' } },
      select: { status: true },
    });
  });
});

describe('assertModuleAccess — server actions stop before any side effect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ModuleAccessError when the plan does not cover the module', async () => {
    arrange({ status: 'ON', allowedModules: PRO_MODULES });

    await expect(assertModuleAccess('M10')).rejects.toThrowError(ModuleAccessError);
    await expect(assertModuleAccess('M10')).rejects.toMatchObject({
      code: 'MODULE_ACCESS_DENIED',
      reason: 'PLAN_UPGRADE_REQUIRED',
      moduleId: 'M10',
    });
  });

  it('returns quietly when the tenant owns the module and it is ON', async () => {
    arrange({ status: 'ON', allowedModules: PRO_MODULES });

    await expect(assertModuleAccess('M8')).resolves.toBeUndefined();
  });
});

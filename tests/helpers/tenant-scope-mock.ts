import { vi } from 'vitest';

/**
 * Shared stub for `@/lib/tenant` in unit tests.
 *
 * Server actions read their tenant from the session (`requireTenantAction`)
 * instead of taking it as an argument, so every action test needs a scope. The
 * real module is replaced rather than partially mocked: importing it pulls in
 * next-auth, which does not resolve under the vitest node environment.
 *
 * Usage — the mock factory must reference this module by dynamic import,
 * because `vi.mock` calls are hoisted above normal imports:
 *
 *   vi.mock('../../src/lib/tenant', async () => {
 *     const m = await import('../helpers/tenant-scope-mock');
 *     return m.tenantModuleStub();
 *   });
 */

export interface FakeTenantScope {
  tenantId: string;
  userId: string;
  role: string;
  workspaceIds: string[];
  isPlatformAdmin: boolean;
}

export const DEFAULT_SCOPE: FakeTenantScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

export class FakeTenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_REQUIRED';

  constructor() {
    super('Request has no tenant scope; refusing to query tenant data.');
    this.name = 'TenantScopeError';
  }
}

/** Mutable so a test can drop the scope and assert the action refuses. */
export const scopeState: { current: FakeTenantScope | null } = { current: DEFAULT_SCOPE };

export function setScope(scope: FakeTenantScope | null): void {
  scopeState.current = scope;
}

export function resetScope(): void {
  scopeState.current = DEFAULT_SCOPE;
}

export function tenantModuleStub() {
  return {
    TenantScopeError: FakeTenantScopeError,
    tenantScopeOf: (session: { tenantId?: unknown } | null | undefined) =>
      session?.tenantId ? scopeState.current : null,
    assertTenant: () => {
      if (!scopeState.current) throw new FakeTenantScopeError();
      return scopeState.current;
    },
    requireTenantAction: vi.fn(async () => {
      if (!scopeState.current) throw new FakeTenantScopeError();
      return scopeState.current;
    }),
  };
}

/**
 * Stub for `@/lib/db` that runs the `withTenant` callback against a plain
 * object standing in for the transactional client.
 */
export function dbModuleStub(tx: unknown) {
  return {
    prisma: {},
    // The callback is typed against whatever fake client the test passed in, so
    // `tx` reaches it unchanged and the action under test is checked as written.
    withTenant: vi.fn(async <T,>(_tenantId: string, cb: (t: never) => Promise<T>) =>
      cb(tx as never)
    ),
    withTenantOn: vi.fn(
      async <T,>(_client: unknown, _tenantId: string, cb: (t: never) => Promise<T>) =>
        cb(tx as never)
    ),
  };
}

/**
 * Shared stub for `@/lib/modules/access` in unit tests.
 *
 * Every AI server action now opens with `assertModuleAccess()` (CLAUDE.md §4 —
 * the module has to be both sold and switched on before an LLM call spends the
 * tenant's credits), and the real module reaches next-auth through `@/lib/auth`,
 * which does not resolve under the vitest node environment. Action tests that
 * are about something else stub it open and stay about that something else; the
 * gate's own behaviour — open, closed, and outside the plan — is asserted
 * end-to-end against the real implementation in tests/modules/ai-module-gate.test.ts.
 */
export class FakeModuleAccessError extends Error {
  readonly code = 'MODULE_ACCESS_DENIED';

  constructor(
    readonly moduleId: string,
    readonly status: string,
    readonly reason: string
  ) {
    super(`Module ${moduleId} is not available (${status}/${reason}).`);
    this.name = 'ModuleAccessError';
  }
}

/** Mutable so a test can close the module and assert the action refuses. */
export const moduleAccessState: { open: boolean } = { open: true };

export function setModuleOpen(open: boolean): void {
  moduleAccessState.open = open;
}

export function resetModuleAccess(): void {
  moduleAccessState.open = true;
}

export function moduleAccessStub() {
  return {
    ModuleAccessError: FakeModuleAccessError,
    checkModuleAccess: vi.fn(async () =>
      moduleAccessState.open
        ? { allowed: true, status: 'ON' }
        : { allowed: false, status: 'OFF', reason: 'MODULE_OFF' }
    ),
    assertModuleAccess: vi.fn(async (moduleId: string) => {
      if (!moduleAccessState.open) {
        throw new FakeModuleAccessError(moduleId, 'OFF', 'MODULE_OFF');
      }
      return { allowed: true, status: 'ON' };
    }),
    // FO-41: the write gate refuses exactly what the read gate refuses here; the
    // stub has no read-only plan.
    assertModuleWrite: vi.fn(async (moduleId: string) => {
      if (!moduleAccessState.open) {
        throw new FakeModuleAccessError(moduleId, 'OFF', 'MODULE_OFF');
      }
    }),
  };
}

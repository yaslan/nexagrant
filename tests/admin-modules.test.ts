import { describe, test, expect, vi } from 'vitest';
import { updateTenantModuleStatus } from '../src/app/[locale]/admin/modules/actions';

// These actions take a `tenantId` argument, so they are platform-admin only.
const auth = vi.fn().mockResolvedValue({
  user: { id: 'admin-user-1', email: 'admin@fabrika.app', isPlatformAdmin: true },
  isPlatformAdmin: true
});

vi.mock('../src/lib/auth', () => ({ auth: () => auth() }));

/**
 * The one fake client, parked in a hoisted box so `withTenant` hands it to its
 * callback BY REFERENCE rather than through a dynamic import of the mocked
 * module, which re-runs this factory and mints fresh `vi.fn()`s
 * (TASK-MTVTPVTEBCF5Z).
 */
const dbBox = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('../src/lib/db', () => {
  const mod = {
  prisma: {
    moduleState: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.tenantId === 'tenant-1') {
          return Promise.resolve([
            { tenantId: 'tenant-1', moduleId: 'M1', status: 'ON' },
            { tenantId: 'tenant-1', moduleId: 'M4', status: 'ON' }
          ]);
        }
        return Promise.resolve([]);
      }),
      upsert: vi.fn().mockResolvedValue({})
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn().mockImplementation(async (cb) => {
      const tx = {
        moduleState: { upsert: vi.fn().mockResolvedValue({}) },
        auditEvent: { create: vi.fn().mockResolvedValue({}) }
      };
      return await cb(tx);
    })
  },
  // The action reads and writes one NAMED tenant, so it is plain tenant scope,
  // not the cross-tenant path (TASK-MTVTPVTEBCF5Z). Same fake client either way.
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never)
  };
  dbBox.client = mod.prisma;
  return mod;
});

/**
 * The cross-tenant path hands its callback the same fake client `prisma`
 * resolves to, exactly as the `withTenant` mocks in this suite do — so the
 * assertions below keep watching the one `vi.fn()` after the code under test
 * moved its query onto `withSystemScope` (TASK-MTVTPVTEBCF5Z). Resolved lazily
 * because `vi.mock` is hoisted above the fixture consts.
 */
vi.mock('../src/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never),
}));

describe('Admin Module Actions', () => {
  test('Enabling M4 requires M1 to be active', async () => {
    // M1 is active in mock, so enabling M4 should succeed
    const result = await updateTenantModuleStatus('tenant-1', 'M4', 'ON');
    expect(result.success).toBe(true);
  });

  test('Setting M1 to OFF cascades disable to M4', async () => {
    const result = await updateTenantModuleStatus('tenant-1', 'M1', 'OFF');
    expect(result.success).toBe(true);
    expect(result.updatedModules).toContain('M1');
    expect(result.updatedModules).toContain('M4');
  });

  test('Enabling M4 fails if dependency M1 is missing', async () => {
    await expect(
      updateTenantModuleStatus('tenant-empty', 'M4', 'ON')
    ).rejects.toThrow('Missing required dependency');
  });

  test('An admin cannot open a Yakında (soon) module, but can still close it', async () => {
    const { prisma } = await import('../src/lib/db');
    const upsert = vi.mocked(prisma.moduleState.upsert);

    for (const status of ['ON', 'PILOT', 'DEV'] as const) {
      upsert.mockClear();
      await expect(
        updateTenantModuleStatus('tenant-1', 'M0', status)
      ).rejects.toThrow('Module is coming soon.');
      expect(upsert, status).not.toHaveBeenCalled();
    }

    const off = await updateTenantModuleStatus('tenant-1', 'M0', 'OFF');
    expect(off.success).toBe(true);
  });

  test('A signed-in user who is not a platform admin is rejected', async () => {
    auth.mockResolvedValueOnce({ user: { id: 'member-1', email: 'member@tenant.app' } });

    await expect(
      updateTenantModuleStatus('tenant-1', 'M4', 'ON')
    ).rejects.toThrow('platform admin required');
  });
});

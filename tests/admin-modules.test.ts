import { describe, test, expect, vi } from 'vitest';
import { updateTenantModuleStatus } from '../src/app/[locale]/admin/modules/actions';

// These actions take a `tenantId` argument, so they are platform-admin only.
const auth = vi.fn().mockResolvedValue({
  user: { id: 'admin-user-1', email: 'admin@fabrika.app', isPlatformAdmin: true },
  isPlatformAdmin: true
});

vi.mock('../src/lib/auth', () => ({ auth: () => auth() }));

vi.mock('../src/lib/db', () => ({
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
  }
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

  test('A signed-in user who is not a platform admin is rejected', async () => {
    auth.mockResolvedValueOnce({ user: { id: 'member-1', email: 'member@tenant.app' } });

    await expect(
      updateTenantModuleStatus('tenant-1', 'M4', 'ON')
    ).rejects.toThrow('platform admin required');
  });
});

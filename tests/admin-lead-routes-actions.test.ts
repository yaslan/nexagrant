import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-171 — the new platform-admin read action refuses a non-admin before touching the data, and
 * forwards to the single-source reader. (The data itself is covered live in
 * tests/province-lead-route.live.test.ts.)
 */
const { requirePlatformAdmin, listIntakeTenantOptions } = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  listIntakeTenantOptions: vi.fn(),
}));
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin }));
vi.mock('@/lib/leads/province-route', () => ({
  deactivateProvinceLeadRoute: vi.fn(),
  listIntakeTenantOptions,
  listProvinceLeadRoutes: vi.fn(),
  listUnmatchedLeads: vi.fn(),
  setProvinceLeadRoute: vi.fn(),
}));

import { listIntakeTenantOptionsAction } from '@/app/[locale]/admin/lead-routes/actions';

beforeEach(() => {
  requirePlatformAdmin.mockReset();
  listIntakeTenantOptions.mockReset();
});

describe('listIntakeTenantOptionsAction', () => {
  test('a non-platform-admin is rejected and nothing is read', async () => {
    requirePlatformAdmin.mockRejectedValue(new Error('PlatformAdminRequiredError'));
    await expect(listIntakeTenantOptionsAction()).rejects.toThrow('PlatformAdminRequiredError');
    expect(listIntakeTenantOptions).not.toHaveBeenCalled();
  });

  test('a platform admin gets the reader result unchanged, even when stray input is passed', async () => {
    requirePlatformAdmin.mockResolvedValue({ userId: 'u1' });
    listIntakeTenantOptions.mockResolvedValue([{ id: 't1', name: 'A' }]);
    await expect(listIntakeTenantOptionsAction()).resolves.toEqual([{ id: 't1', name: 'A' }]);
    await expect(listIntakeTenantOptionsAction('junk' as unknown as undefined)).resolves.toEqual([{ id: 't1', name: 'A' }]);
    expect(listIntakeTenantOptions).toHaveBeenCalledTimes(2);
  });
});

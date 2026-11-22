import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-171 — the new platform-admin read action refuses a non-admin before touching the data, and
 * forwards to the single-source reader. (The data itself is covered live in
 * tests/province-lead-route.live.test.ts.)
 */
const { requirePlatformAdmin, listIntakeTenantOptions, listStuckRoutedLeads } = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  listIntakeTenantOptions: vi.fn(),
  listStuckRoutedLeads: vi.fn(),
}));
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin }));
vi.mock('@/lib/leads/province-route', () => ({
  deactivateProvinceLeadRoute: vi.fn(),
  listIntakeTenantOptions,
  listProvinceLeadRoutes: vi.fn(),
  listUnmatchedLeads: vi.fn(),
  setProvinceLeadRoute: vi.fn(),
}));

vi.mock('@/lib/leads/stuck-leads', () => ({ listStuckRoutedLeads, STUCK_PAGE_MAX: 200 }));

import { listIntakeTenantOptionsAction, listStuckRoutedLeadsAction } from '@/app/[locale]/admin/lead-routes/actions';
import { publicLeadStuckAfterMinutes } from '@/lib/env';

beforeEach(() => {
  requirePlatformAdmin.mockReset();
  listIntakeTenantOptions.mockReset();
  listStuckRoutedLeads.mockReset();
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

describe('listStuckRoutedLeadsAction (NG-182)', () => {
  test('a non-platform-admin is rejected and nothing is read', async () => {
    requirePlatformAdmin.mockRejectedValue(new Error('PlatformAdminRequiredError'));
    await expect(listStuckRoutedLeadsAction()).rejects.toThrow('PlatformAdminRequiredError');
    expect(listStuckRoutedLeads).not.toHaveBeenCalled();
  });

  test('a platform admin reads as platform-admin, capped at the page max, with no caller threshold (the reader applies the env one)', async () => {
    requirePlatformAdmin.mockResolvedValue({ userId: 'u1' });
    const page = { rows: [], total: 0, olderThanMinutes: publicLeadStuckAfterMinutes() };
    listStuckRoutedLeads.mockResolvedValue(page);
    await expect(listStuckRoutedLeadsAction()).resolves.toBe(page);
    expect(listStuckRoutedLeads).toHaveBeenCalledWith(undefined, { purpose: 'platform-admin', limit: 200 });
  });
});

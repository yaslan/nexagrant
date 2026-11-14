import { beforeEach, describe, expect, test, vi } from 'vitest';

const service = vi.hoisted(() => ({
  listProvinceLeadRoutes: vi.fn(async () => []),
  setProvinceLeadRoute: vi.fn(async () => ({ ok: true })),
  deactivateProvinceLeadRoute: vi.fn(async () => ({ ok: true })),
  listUnmatchedLeads: vi.fn(async () => ({ rows: [], total: 0 })),
}));
const auth = vi.hoisted(() => ({ requirePlatformAdmin: vi.fn() }));
vi.mock('@/lib/leads/province-route', () => service);
vi.mock('@/lib/tenant', () => auth);

import {
  deactivateProvinceLeadRouteAction,
  listProvinceLeadRoutesAction,
  listUnmatchedLeadsAction,
  setProvinceLeadRouteAction,
} from './actions';

/** NG-167 — every lead-routing action is platform-admin only and validates its input. */
describe('lead-routes actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePlatformAdmin.mockResolvedValue({ userId: 'admin_1' });
  });

  test('a non-admin is refused before any service call, by every action', async () => {
    auth.requirePlatformAdmin.mockRejectedValue(new Error('PLATFORM_ADMIN_REQUIRED'));
    await expect(listProvinceLeadRoutesAction()).rejects.toThrow('PLATFORM_ADMIN_REQUIRED');
    await expect(setProvinceLeadRouteAction({ province: 'Rize', tenantId: 't' })).rejects.toThrow();
    await expect(deactivateProvinceLeadRouteAction({ province: 'Rize' })).rejects.toThrow();
    await expect(listUnmatchedLeadsAction()).rejects.toThrow();
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  test('set passes the admin id as actor; malformed input never reaches the service', async () => {
    await setProvinceLeadRouteAction({ province: 'Rize', tenantId: 't_1' });
    expect(service.setProvinceLeadRoute).toHaveBeenCalledWith({ province: 'Rize', tenantId: 't_1' }, 'admin_1');
    expect(await setProvinceLeadRouteAction({ province: '', tenantId: 't_1' })).toEqual({ ok: false, error: 'invalid_province' });
    expect(await setProvinceLeadRouteAction({ province: 'Rize', tenantId: 5 as unknown as string })).toEqual({ ok: false, error: 'invalid_province' });
    expect(service.setProvinceLeadRoute).toHaveBeenCalledTimes(1);
  });

  test('deactivate passes the admin id as actor', async () => {
    await deactivateProvinceLeadRouteAction({ province: 'Rize' });
    expect(service.deactivateProvinceLeadRoute).toHaveBeenCalledWith({ province: 'Rize' }, 'admin_1');
  });

  test('unmatched list tolerates garbage paging', async () => {
    await listUnmatchedLeadsAction({ limit: 'x' } as never);
    expect(service.listUnmatchedLeads).toHaveBeenCalledWith({});
  });
});

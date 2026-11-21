import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * NG-275 — /settings/api-keys with M1 closed. The role door (`view_partner_search`) now
 * runs before `moduleGate('M1')`. Pins the FO-81 withdrawal path: an authorised role
 * still gets the revoke panel under the lock, an unauthorised role never reaches the
 * module state, and the open page is unchanged.
 */

const h = vi.hoisted(() => ({
  requireTenantPageRole: vi.fn(),
  moduleGate: vi.fn(),
  checkModuleAccess: vi.fn(),
  calls: [] as string[],
  ApiKeysClient: vi.fn(() => null),
  RevokeApiKeysPanel: vi.fn(() => null),
}));

vi.mock('@/lib/page-role', () => ({ requireTenantPageRole: h.requireTenantPageRole }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: h.moduleGate }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: h.checkModuleAccess }));
vi.mock('@/lib/db', () => ({
  withTenant: async () => [{ id: 'k1', name: 'ERP', prefix: 'fp_live_9b4e72', lastUsedAt: null, createdAt: new Date(0) }],
}));
vi.mock('@/lib/app-url', () => ({ appUrl: () => 'https://example.test' }));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/client', () => ({ ApiKeysClient: h.ApiKeysClient }));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/revoke-panel', () => ({ RevokeApiKeysPanel: h.RevokeApiKeysPanel }));

async function renderPage(): Promise<ReactElement<{ children: unknown }>> {
  const { default: Page } = await import('@/app/[locale]/(app)/[workspace]/settings/api-keys/page');
  return (await Page({ params: Promise.resolve({ locale: 'tr', workspace: 'main' }) })) as ReactElement<{
    children: unknown;
  }>;
}

beforeEach(() => {
  h.calls.length = 0;
  h.requireTenantPageRole.mockReset().mockImplementation(async () => {
    h.calls.push('role');
    return { tenantId: 't1', role: 'TENANT_OWNER', userId: 'u1' };
  });
  h.moduleGate.mockReset().mockImplementation(async () => {
    h.calls.push('module');
    return 'LOCK-SCREEN';
  });
  h.checkModuleAccess.mockReset().mockResolvedValue({ allowed: false, status: 'OFF' });
});

describe('/settings/api-keys with M1 closed (FO-81, NG-275)', () => {
  it('runs the role door before the M1 module gate', async () => {
    await renderPage();
    expect(h.calls).toEqual(['role', 'module']);
  });

  it('authorised role: lock screen plus the withdrawal panel with the real rows', async () => {
    const el = await renderPage();
    const [lock, panel] = el.props.children as [unknown, ReactElement<{ apiKeys: unknown[]; canManage: boolean }>];
    expect(lock).toBe('LOCK-SCREEN');
    expect(panel.type).toBe(h.RevokeApiKeysPanel);
    expect(panel.props.apiKeys).toHaveLength(1);
    expect(panel.props.canManage).toBe(true);
    expect(h.ApiKeysClient).not.toHaveBeenCalled();
  });

  it('unauthorised role: the door throws, the module state is never read', async () => {
    h.requireTenantPageRole.mockImplementation(async () => {
      h.calls.push('role');
      throw new Error('FORBIDDEN');
    });
    await expect(renderPage()).rejects.toThrow('FORBIDDEN');
    expect(h.moduleGate).not.toHaveBeenCalled();
    expect(h.RevokeApiKeysPanel).not.toHaveBeenCalled();
  });

  it('open module: the client renders and the withdrawal panel does not', async () => {
    h.moduleGate.mockImplementation(async () => {
      h.calls.push('module');
      return null;
    });
    const el = await renderPage();
    const child = el.props.children as ReactElement<{ apiKeys: unknown[] }>;
    expect(child.type).toBe(h.ApiKeysClient);
    expect(h.RevokeApiKeysPanel).not.toHaveBeenCalled();
  });
});

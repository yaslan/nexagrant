import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * FO-157 — the api-keys page hands the client its read-only state from the M1
 * gate's `limits` (FO-41 entitlement), not from the plan's name.
 */

const { checkModuleAccess, ApiKeysClient } = vi.hoisted(() => ({
  checkModuleAccess: vi.fn(),
  ApiKeysClient: vi.fn(() => null),
}));

vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess }));
vi.mock('@/lib/tenant', () => ({ requireTenantPage: async () => ({ tenantId: 't1', role: 'TENANT_OWNER' }) }));
vi.mock('@/lib/db', () => ({ withTenant: async () => [] }));
vi.mock('@/lib/app-url', () => ({ appUrl: () => 'https://example.test' }));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/client', () => ({ ApiKeysClient }));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/revoke-panel', () => ({ RevokeApiKeysPanel: () => null }));

async function readOnlyProp(): Promise<unknown> {
  const { default: Page } = await import('@/app/[locale]/(app)/[workspace]/settings/api-keys/page');
  const el = (await Page({ params: Promise.resolve({ locale: 'tr', workspace: 'main' }) })) as ReactElement<{
    children: ReactElement<{ readOnly: unknown }>;
  }>;
  return el.props.children.props.readOnly;
}

beforeEach(() => checkModuleAccess.mockReset());

describe('/settings/api-keys read-only flag (FO-157)', () => {
  it('passes the read-only notice when the plan grants M1 read only', async () => {
    checkModuleAccess.mockResolvedValue({ allowed: true, status: 'ON', limits: { readOnly: true, partnerSearchPerMonth: 10 } });
    expect(await readOnlyProp()).toEqual({
      moduleName: 'Partner Intelligence Database',
      plans: ['Pro', 'Ultra'],
      upgradeHref: '/tr/main/settings/billing',
    });
    expect(checkModuleAccess).toHaveBeenCalledWith('M1');
  });

  it('passes nothing when M1 is granted in full', async () => {
    checkModuleAccess.mockResolvedValue({ allowed: true, status: 'ON' });
    expect(await readOnlyProp()).toBeNull();
  });
});

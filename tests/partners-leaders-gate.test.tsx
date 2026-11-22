/**
 * FO-163 — /partners/leaders is read the way /api/cordis/* is read: a signed-in
 * member whose plan opens M1 in full, counted per user, and no monthly quota.
 * The page's own queries are replaced; the gate helper (FO-160) runs for real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { NextResponse } from 'next/server';

const { requireTenantApi, checkModuleAccess, findMany, count, meterPartnerSearch } = vi.hoisted(() => ({
  requireTenantApi: vi.fn(),
  checkModuleAccess: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  meterPartnerSearch: vi.fn(),
}));

vi.mock('@/lib/page-role', () => ({ requireTenantPageRole: async () => ({ tenantId: 't1', userId: 'u1', role: 'TENANT_OWNER', isPlatformAdmin: false }) }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/lib/tenant', () => ({ requireTenantApi, tenantScopeOf: () => null }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess, requestSession: async () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/db', () => ({ prisma: { cordisPartnerProfile: { findMany, count } } }));
vi.mock('@/modules/m1/server/partner-search/monthly-quota', () => ({ meterPartnerSearch }));

const signedIn = { ok: true, scope: { userId: 'u-gate', tenantId: 't1', role: 'MEMBER', isPlatformAdmin: false } };
const fullM1 = { allowed: true, status: 'ON' };

async function render(): Promise<string> {
  const { default: LeadersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/leaders/page');
  const el = await LeadersPage({
    params: Promise.resolve({ locale: 'en', workspace: 'main' }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  requireTenantApi.mockReset();
  checkModuleAccess.mockReset();
  findMany.mockReset();
  count.mockReset();
  meterPartnerSearch.mockReset();
  requireTenantApi.mockResolvedValue({ ...signedIn, scope: { ...signedIn.scope, userId: 'u-gate' } });
  checkModuleAccess.mockResolvedValue(fullM1);
  findMany.mockResolvedValue([
    { organisationId: '999999999', name: 'Example Org', totalProjects: 3, coordinatorProjects: 2, country: 'DE', activityType: 'REC' },
  ]);
  count.mockResolvedValue(0);
});

describe('/partners/leaders gate (FO-163)', () => {
  it('anonymous: refused before any lookup runs', async () => {
    requireTenantApi.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const html = await render();
    expect(html).toContain('signInRequired');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('M1 off for the tenant: the module gate refuses, no lookup runs', async () => {
    checkModuleAccess.mockResolvedValue({ allowed: false, status: 'OFF', reason: 'MODULE_OFF' });
    const html = await render();
    expect(html).toContain('reason.MODULE_OFF');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('limited M1 plan: refused the way /api/cordis/* refuses it (403)', async () => {
    checkModuleAccess.mockResolvedValue({ allowed: true, status: 'ON', limits: { maxSearchesPerMonth: 10 } });
    const html = await render();
    expect(html).toContain('limitedPlan');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('past the per-user window: 429 message, the lookup is not run', async () => {
    // Fill the window for this user first; the shared limiter keys on userId.
    const { CORDIS_SESSION_PER_USER_PER_MINUTE } = await import('@/lib/cordis-api-auth');
    requireTenantApi.mockResolvedValue({ ...signedIn, scope: { ...signedIn.scope, userId: 'u-flood' } });
    for (let i = 0; i < CORDIS_SESSION_PER_USER_PER_MINUTE; i++) {
      await authorizeOnce('u-flood');
    }
    findMany.mockClear();
    const html = await render();
    expect(html).toContain('rateLimited');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('normal member: the list renders and no monthly quota is counted', async () => {
    const html = await render();
    expect(html).toContain('Example Org');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(meterPartnerSearch).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});

async function authorizeOnce(userId: string) {
  requireTenantApi.mockResolvedValueOnce({ ...signedIn, scope: { ...signedIn.scope, userId } });
  const { authenticateCordisSession } = await import('@/lib/cordis-api-auth');
  return authenticateCordisSession();
}

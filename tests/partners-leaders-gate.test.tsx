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
// NG-250 (review B1): the page's NexaGrant plan gate reads the tenant's plan from the database;
// here it is replaced: by default it lets the page through, and the "plan gate refuses" test
// below makes it return a refusal to prove the page returns it before any reader runs. The
// gate's own decision is covered by tests/ng250-plan-gate.live.test.ts and
// src/lib/billing/nexagrant/page-gate.test.tsx.
const { ngPageGate, cordisSessionOverride, coordinatorLeaders } = vi.hoisted(() => ({
  ngPageGate: vi.fn(async (..._args: unknown[]): Promise<ReactElement | null> => null),
  coordinatorLeaders: vi.fn(async () => []),
  cordisSessionOverride: { value: null as null | { authenticated: true; session?: { tenantId: string; role: string } } },
}));
vi.mock('@/lib/billing/nexagrant/page-gate', () => ({ ngPageGate }));
// NG-250 (review 4, Bulgu A): the `?topic=` path's reader, so a refusal can be shown to skip it too.
vi.mock('@/lib/k2-cordis/coordinator-leaders', () => ({ coordinatorLeaders }));
// NG-250 review F2: lets one test hand the page an authorised result with no member session.
vi.mock('@/lib/cordis-api-auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/cordis-api-auth')>();
  return {
    ...real,
    authenticateCordisSession: async () => cordisSessionOverride.value ?? real.authenticateCordisSession(),
  };
});

const signedIn = { ok: true, scope: { userId: 'u-gate', tenantId: 't1', role: 'MEMBER', isPlatformAdmin: false } };
const fullM1 = { allowed: true, status: 'ON' };

async function render(searchParams: { topic?: string } = {}): Promise<string> {
  const { default: LeadersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/leaders/page');
  const el = await LeadersPage({
    params: Promise.resolve({ locale: 'en', workspace: 'main' }),
    searchParams: Promise.resolve(searchParams),
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
  ngPageGate.mockReset();
  ngPageGate.mockResolvedValue(null);
  coordinatorLeaders.mockReset();
  coordinatorLeaders.mockResolvedValue([]);
  cordisSessionOverride.value = null;
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

  it('NG-250 F2: authorised but no member session — fails closed, no lookup runs', async () => {
    // The CORDIS door type allows `session` to be absent (the API-key branch). The plan gate
    // needs a member; without one the page must refuse, not skip the gate and read the data.
    cordisSessionOverride.value = { authenticated: true };
    const html = await render();
    expect(html).toContain('signInRequired');
    expect(ngPageGate).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('NG-250: a member session goes through the NexaGrant plan gate before the lookup', async () => {
    const html = await render();
    expect(ngPageGate).toHaveBeenCalledWith({ tenantId: 't1', role: 'MEMBER' }, 'en', 'view_partner_search', 'partner_search');
    expect(html).toContain('Example Org');
  });

  it('NG-250 (review 4, Bulgu A): the plan gate refuses — its element is returned, no reader runs', async () => {
    // The page must hand back whatever the plan gate returns and stop there: neither the global
    // list (findMany) nor the topic path (coordinatorLeaders) may be read for a refused plan.
    for (const searchParams of [{}, { topic: 'HORIZON-CL5' }]) {
      ngPageGate.mockResolvedValueOnce(<section data-testid="ng-plan-gate" />);
      const html = await render(searchParams);
      expect(html).toContain('data-testid="ng-plan-gate"');
      expect(html).not.toContain('Example Org');
    }
    expect(ngPageGate).toHaveBeenCalledTimes(2);
    expect(findMany).not.toHaveBeenCalled();
    expect(coordinatorLeaders).not.toHaveBeenCalled();
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

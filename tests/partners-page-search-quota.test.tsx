import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * FO-41 (crw-fb Ö-1) — the /partners page meters a search only when it carries
 * a criterion, and a used-up month runs no lookup. The monthly counter itself
 * is tested in its own module; these pin the page's wiring to it.
 */

const { count, findMany, meterPartnerSearch } = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  meterPartnerSearch: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/components/ModuleLink', () => ({ ModuleLink: () => null }));
// The live tab renders a client-side browser; only the server-side meter matters here.
vi.mock('@/modules/m1/ui/partner-search/AnnouncementBrowser', () => ({ AnnouncementBrowser: () => null }));
vi.mock('@/modules/m1/ui/partner-search/ActiveAnnouncementsBadge', () => ({ ActiveAnnouncementsBadge: () => null }));
vi.mock('@/app/[locale]/(app)/[workspace]/partners/PartnerFilters', () => ({ PartnerFilters: () => null }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/modules/m1/server/partner-search/monthly-quota', () => ({ meterPartnerSearch }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { cordisPartnerProfile: { count, findMany } } }));
vi.mock('@/lib/tenant', () => ({ requireTenantPage: async () => ({ tenantId: 'tenant-1', role: 'MEMBER' }) }));
vi.mock('@/lib/billing', () => ({
  getEntitlements: async () => ({ planId: 'free', allowedModules: ['M1', 'M5'] }),
}));

async function render(searchParams: Record<string, string>): Promise<string> {
  const { default: PartnersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/page');
  const el = await PartnersPage({
    params: Promise.resolve({ locale: 'en', workspace: 'main' }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  count.mockReset();
  findMany.mockReset();
  meterPartnerSearch.mockReset();
  count.mockResolvedValue(0);
  findMany.mockResolvedValue([]);
  meterPartnerSearch.mockResolvedValue({ allowed: true, used: 1, limit: 10 });
});

describe('/partners monthly search quota (FO-41)', () => {
  it('counts a search that carries a criterion', async () => {
    await render({ q: 'enercon' });
    expect(meterPartnerSearch).toHaveBeenCalledTimes(1);
  });

  it('does not count browsing the default list', async () => {
    await render({});
    expect(meterPartnerSearch).not.toHaveBeenCalled();
  });

  it('runs no lookup and shows the alert once the month is used up', async () => {
    meterPartnerSearch.mockResolvedValue({ allowed: false, used: 10, limit: 10 });
    const html = await render({ q: 'enercon' });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="partner-search-quota"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('searchQuotaExhausted');
  });

  it('does not count the live tab twice when a criterion is in the URL', async () => {
    // The live tab is metered by its own FO-61 call; a hand-typed ?tab=live&q=x
    // must not also spend a month slot here.
    await render({ tab: 'live', q: 'x' });
    expect(meterPartnerSearch).not.toHaveBeenCalled();
  });

  it('shows the usage notice while the month still has searches left', async () => {
    const html = await render({ q: 'enercon' });
    expect(html).toContain('role="status"');
    expect(html).toContain('searchQuotaUsed');
    expect(findMany).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * TASK-MVMH1QY3UV53I (FO-130) — the /partners table printed the grant column as
 * `€ ${Number(x).toLocaleString()}`: the server's locale rather than the
 * request's, and a `Number()` that drops digits past the safe integer range.
 * The column (whole EUR, CORDIS) now goes through `formatWholeMoney`.
 */

const { count, findMany } = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/components/ModuleLink', () => ({ ModuleLink: () => null }));
vi.mock('@/app/[locale]/(app)/[workspace]/partners/PartnerFilters', () => ({ PartnerFilters: () => null }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { cordisPartnerProfile: { count, findMany } } }));

function profile(organisationId: string, totalEcContribution: bigint | null) {
  return {
    organisationId,
    name: organisationId,
    country: 'DE',
    activityType: 'REC',
    sme: true,
    isTurkish: false,
    totalProjects: 3,
    coordinatorProjects: 1,
    totalEcContribution,
    topTopics: [],
  };
}

async function render(locale: string): Promise<string> {
  const { default: PartnersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/page');
  const el = await PartnersPage({
    params: Promise.resolve({ locale, workspace: 'main' }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  count.mockReset();
  findMany.mockReset();
  count.mockResolvedValue(3);
  findMany.mockResolvedValue([
    profile('ORG-A', 1_234_567n),
    profile('ORG-B', 9_007_199_254_740_993n),
    profile('ORG-C', null),
  ]);
});

describe('/partners grant column', () => {
  it('renders whole EUR in the tr money format', async () => {
    const html = await render('tr');
    expect(html).toContain('>€1.234.567<');
    expect(html).toContain('>€9.007.199.254.740.993<');
    expect(html).not.toMatch(/€ \d/);
  });

  it('renders whole EUR in the en money format', async () => {
    const html = await render('en');
    expect(html).toContain('>€1,234,567<');
    expect(html).toContain('>€9,007,199,254,740,993<');
    expect(html).not.toMatch(/€ \d/);
  });

  it('keeps an unknown total as a dash, not a zero', async () => {
    const html = await render('en');
    expect(html).not.toContain('>€0<');
  });

  it('labels the SME badge from the catalogue', async () => {
    const html = await render('tr');
    expect(html).toContain('>smeBadge<');
    expect(html).not.toMatch(/>\s*SME\s*</);
  });
});

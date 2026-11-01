import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * TASK-MVMH1QY3UV53I (FO-130) — /partners/[pic] chose every label with an
 * `isTr ? '…' : '…'` ternary and printed EU funding as
 * `€ ${Number(x).toLocaleString()}`, which formats in the *server's* locale,
 * not the request's. Labels now come from the `PartnerDetail` catalogue and
 * amounts (whole EUR, CORDIS `ecContribution`) go through `formatWholeMoney`.
 */

const { findUnique, findParticipations, findTopics } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findParticipations: vi.fn(),
  findTopics: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () =>
    Object.assign((key: string, values?: Record<string, string>) => (values ? `${key}(${values.value})` : key), {
      raw: () => ({}),
    }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('next/navigation', () => ({ notFound: () => null }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/modules/m1/ui/PartnerOutreach', () => ({ PartnerOutreach: () => null }));
vi.mock('@/modules/m1/ui/partner-search/OrganizationAnnouncements', () => ({ OrganizationAnnouncements: () => null }));
vi.mock('@/lib/db', () => ({
  prisma: {
    cordisOrganization: { findUnique },
    cordisParticipation: { findMany: findParticipations },
    cordisProjectTopic: { findMany: findTopics },
  },
}));

function participation(projectId: string, ecContribution: bigint | null) {
  return {
    projectId,
    organisationId: '999999999',
    role: 'participant',
    ecContribution,
    project: { id: projectId, acronym: projectId, title: null },
  };
}

async function render(locale: string): Promise<string> {
  const { default: PartnerDetailPage } = await import('@/app/[locale]/(app)/[workspace]/partners/[pic]/page');
  const el = await PartnerDetailPage({ params: Promise.resolve({ pic: '999999999', locale, workspace: 'main' }) });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  findUnique.mockReset();
  findParticipations.mockReset();
  findTopics.mockReset();
  findUnique.mockResolvedValue({ organisationId: '999999999', name: 'ORG', country: 'DE', activityType: 'REC', sme: true });
  findParticipations.mockResolvedValue([
    participation('P1', 1_234_567n),
    participation('P2', 9_007_199_254_740_993n),
    participation('P3', null),
  ]);
  findTopics.mockResolvedValue([]);
});

describe('/partners/[pic]', () => {
  it('formats the EU funding in the tr money format', async () => {
    const html = await render('tr');
    expect(html).toContain('>€9.007.199.255.975.560<');
    expect(html).toContain('>€1.234.567<');
    expect(html).toContain('>€0<');
    expect(html).not.toMatch(/€ \d/);
  });

  it('formats the EU funding in the en money format', async () => {
    const html = await render('en');
    expect(html).toContain('>€9,007,199,255,975,560<');
    expect(html).toContain('>€1,234,567<');
    expect(html).not.toMatch(/€ \d/);
  });

  it('takes every label from the catalogue, in either locale', async () => {
    for (const locale of ['tr', 'en']) {
      const html = await render(locale);
      expect(html).toContain('>totalEcFunding<');
      expect(html).toContain('countryLabel(DE)');
      expect(html).toContain('>smeBadge<');
      // The old hard-coded strings, either language, in any text node.
      expect(html).not.toMatch(/>[^<]*\b(Panel|Dashboard|Ortaklar|Partners|Ülke|Country|Toplam|Total|KOBİ|SME|Grafiği|Graph)\b/u);
    }
  });
});

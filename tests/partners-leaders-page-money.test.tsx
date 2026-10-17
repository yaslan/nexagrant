import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * TASK-MVBF53ACTGRT1 (FO-15) — the coordinator cards on /partners/leaders?topic=
 * printed the EU contribution as `${number} €`, a hard-coded symbol after the
 * number in every locale. The total is whole EUR (CORDIS `ecContribution`) and
 * now goes through `formatWholeMoney`, so the symbol and separators follow the
 * locale and a total past the safe integer range keeps every digit.
 */

const { coordinatorLeaders } = vi.hoisted(() => ({ coordinatorLeaders: vi.fn() }));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/lib/db', () => ({ prisma: { cordisPartnerProfile: { findMany: vi.fn() } } }));
vi.mock('@/lib/k2-cordis/coordinator-leaders', () => ({ coordinatorLeaders }));

function row(organisationId: string, totalEcContribution: bigint) {
  return { organisationId, name: organisationId, shortName: null, country: 'DE', coordinatedProjects: 1, totalEcContribution };
}

async function render(locale: string): Promise<string> {
  const { default: LeadersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/leaders/page');
  const el = await LeadersPage({
    params: Promise.resolve({ locale, workspace: 'main' }),
    searchParams: Promise.resolve({ topic: 'HORIZON-CL5-' }),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  coordinatorLeaders.mockReset();
  coordinatorLeaders.mockResolvedValue([row('ORG-A', 1_234_567n), row('ORG-B', 9_007_199_254_740_993n)]);
});

describe('/partners/leaders?topic= EU contribution', () => {
  it('renders the total in the tr money format', async () => {
    const html = await render('tr');
    expect(html).toContain('>€1.234.567<');
    expect(html).toContain('>€9.007.199.254.740.993<');
    expect(html).not.toMatch(/\d €/);
  });

  it('renders the total in the en money format', async () => {
    const html = await render('en');
    expect(html).toContain('>€1,234,567<');
    expect(html).toContain('>€9,007,199,254,740,993<');
    expect(html).not.toMatch(/\d €/);
  });
});

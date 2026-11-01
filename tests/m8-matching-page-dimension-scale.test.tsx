// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * FO-155 Ö-1 — the matching page shows the matcher's ranges ("3.0 / 35") only on
 * rows the matcher wrote. The consortium builder writes `SeatCandidate` rows for
 * the same seats with a 0–3 topicExperience; shown against the matcher's 35 that
 * row would read "3.0 / 35". Such a row, and one neither scorer wrote, gets bare
 * numbers. Rendered through the page itself so the writer check there is covered.
 */

const { candidates } = vi.hoisted(() => ({ candidates: { rows: [] as unknown[] } }));

vi.mock('next-intl/server', async () => {
  const { createTranslator: make } = await import('next-intl');
  const tr = (await import('../messages/tr.json')).default;
  const en = (await import('../messages/en.json')).default;
  const { createFormatter } = await import('next-intl');
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: 'Consortium' }) =>
      make({ locale, messages: locale === 'tr' ? tr : en, namespace }),
    getFormatter: async ({ locale }: { locale: string }) => createFormatter({ locale }),
  };
});
vi.mock('next/navigation', () => ({ notFound: () => null }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/lib/tenant', () => ({ requireTenantPage: async () => ({ tenantId: 't-1' }) }));
vi.mock('@/modules/m8/components/find-candidates-button', () => ({ default: () => null }));
vi.mock('@/modules/m8/components/invite-candidate-button', () => ({ default: () => null }));
vi.mock('@/lib/db', () => ({
  withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({
      opportunity: {
        findFirst: async () => ({
          id: 'o-1',
          title: 'Opp',
          seats: [{ id: 's-1', roleKey: 'research', status: 'OPEN', organizationId: null }],
        }),
      },
      seatCandidate: { findMany: async () => candidates.rows },
      cordisOrganization: { findMany: async () => [], count: async () => 1 },
    }),
}));

const MATCH = {
  topicExperience: 3,
  geographicBalance: 15,
  collabHistory: 0,
  relationshipWarmth: 0,
  centrality: 2,
  rivalRisk: -10,
};
const CONSORTIUM = {
  topicExperience: 3,
  networkCentrality: 1.2,
  countryDiversity: 1.5,
  smeBonus: 0,
  warmthBonus: 0,
  liveDemandSignal: 0.4,
  liveDemandReason: null,
  total: 61.5,
};

function row(id: string, rank: number, breakdown: unknown) {
  return { id, seatId: 's-1', rank, score: 50, breakdown, organizationId: `org-${id}` };
}

/** Each candidate row's dimension texts, keyed by the organisation id it shows. */
async function dimensionsByRow(locale: 'tr' | 'en'): Promise<Record<string, Record<string, string>>> {
  return (await renderRows(locale)).dimensions;
}

/** Each candidate row's total ("50,0 / 100") and dimension texts, keyed by organisation id. */
async function renderRows(
  locale: 'tr' | 'en'
): Promise<{ totals: Record<string, string>; dimensions: Record<string, Record<string, string>> }> {
  const { default: MatchingPage } = await import('@/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page');
  const el = await MatchingPage({ params: Promise.resolve({ locale, workspace: 'main', id: 'o-1' }) });
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(el as ReactElement);
  const dimensions: Record<string, Record<string, string>> = {};
  const totals: Record<string, string> = {};
  for (const tr of host.querySelectorAll('tbody tr')) {
    const cells: Record<string, string> = {};
    for (const dd of tr.querySelectorAll('[data-testid^="m8-dimension-"]')) {
      cells[dd.getAttribute('data-testid')!.replace('m8-dimension-', '')] = dd.textContent ?? '';
    }
    const org = tr.querySelector('.text-xs.text-muted')!.textContent!.split('|')[1]!.trim();
    dimensions[org] = cells;
    totals[org] = tr.querySelector('.font-bold.tabular-nums')?.textContent ?? '';
  }
  return { totals, dimensions };
}

beforeEach(() => {
  candidates.rows = [row('match', 1, MATCH), row('consortium', 2, CONSORTIUM), row('legacy', 3, { topicExperience: 3 })];
});

describe('matching page breakdown', () => {
  // Numbers follow the locale (FO-162): Turkish "3,0 / 35", English "3.0 / 35".
  it.each([
    ['tr', ',', '(aralık -10…0)'],
    ['en', '.', '(range -10…0)'],
  ] as const)('%s: the matcher\'s ranges on its own rows only', async (locale, sep, penalty) => {
    const n = (whole: number) => `${whole}${sep}0`;
    const rows = await dimensionsByRow(locale);

    expect(rows['org-match']).toMatchObject({
      topicExperience: `${n(3)} / 35`,
      geographicBalance: `${n(15)} / 15`,
      centrality: `${n(2)} / 10`,
      rivalRisk: `${n(-10)} ${penalty}`,
    });
    // The consortium builder's 0–3 topicExperience is not "3.0 / 35".
    expect(rows['org-consortium']).toEqual({
      topicExperience: n(3),
      geographicBalance: n(0),
      collabHistory: n(0),
      relationshipWarmth: n(0),
      centrality: n(0),
      rivalRisk: n(0),
    });
    // Neither scorer wrote it: bare numbers, no throw.
    expect(rows['org-legacy']?.topicExperience).toBe(n(3));
    expect(Object.values(rows['org-legacy'] ?? {}).every((v) => !v.includes('/'))).toBe(true);
  });

  it.each([
    ['tr', '61,5 / 100', '50,0 / 100'],
    ['en', '61.5 / 100', '50.0 / 100'],
  ] as const)('%s: the total uses the same number format as the dimensions', async (locale, fractional, whole) => {
    candidates.rows = [{ ...row('match', 1, MATCH), score: 61.5 }, row('legacy', 2, { topicExperience: 3 })];
    const { totals } = await renderRows(locale);
    expect(totals['org-match']).toBe(fractional);
    expect(totals['org-legacy']).toBe(whole);
  });
});

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
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: 'Consortium' }) =>
      make({ locale, messages: locale === 'tr' ? tr : en, namespace }),
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
  const { default: MatchingPage } = await import('@/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page');
  const el = await MatchingPage({ params: Promise.resolve({ locale, workspace: 'main', id: 'o-1' }) });
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(el as ReactElement);
  const out: Record<string, Record<string, string>> = {};
  for (const tr of host.querySelectorAll('tbody tr')) {
    const cells: Record<string, string> = {};
    for (const dd of tr.querySelectorAll('[data-testid^="m8-dimension-"]')) {
      cells[dd.getAttribute('data-testid')!.replace('m8-dimension-', '')] = dd.textContent ?? '';
    }
    out[tr.querySelector('.text-xs.text-muted')!.textContent!.split('|')[1]!.trim()] = cells;
  }
  return out;
}

beforeEach(() => {
  candidates.rows = [row('match', 1, MATCH), row('consortium', 2, CONSORTIUM), row('legacy', 3, { topicExperience: 3 })];
});

describe('matching page breakdown', () => {
  it.each([
    ['tr', '(aralık -10…0)'],
    ['en', '(range -10…0)'],
  ] as const)('%s: the matcher\'s ranges on its own rows only', async (locale, penalty) => {
    const rows = await dimensionsByRow(locale);

    expect(rows['org-match']).toMatchObject({
      topicExperience: '3.0 / 35',
      geographicBalance: '15.0 / 15',
      centrality: '2.0 / 10',
      rivalRisk: `-10.0 ${penalty}`,
    });
    // The consortium builder's 0–3 topicExperience is not "3.0 / 35".
    expect(rows['org-consortium']).toEqual({
      topicExperience: '3.0',
      geographicBalance: '0.0',
      collabHistory: '0.0',
      relationshipWarmth: '0.0',
      centrality: '0.0',
      rivalRisk: '0.0',
    });
    // Neither scorer wrote it: bare numbers, no throw.
    expect(rows['org-legacy']?.topicExperience).toBe('3.0');
    expect(Object.values(rows['org-legacy'] ?? {}).every((v) => !v.includes('/'))).toBe(true);
  });
});

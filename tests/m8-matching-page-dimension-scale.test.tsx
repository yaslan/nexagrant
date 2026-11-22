// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * FO-155 Ö-1 + NG-100 / K-579931=A — the matching page shows only the rows the current
 * M8 matcher wrote (`visibleSeatCandidates`), with the matcher's ranges ("3.0 / 34").
 * Rows left by the pre-K-578751 matcher (six keys) and by the retired consortium scorer
 * are hidden on every screen, not shown with a note: they stay in the table and reappear
 * when their seat is matched again. Rendered through the page itself so the filter there
 * is covered; if the filter is removed, these assertions fail.
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
vi.mock('@/lib/tenant', () => ({ requireTenantPage: async () => ({ tenantId: 't-1', role: 'MEMBER' }) }));
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

/** The current matcher (six-to-four keys, out of 34 / 33 / 33 / penalty −10…0). */
const MATCH = {
  topicExperience: 3,
  geographicBalance: 33,
  collabHistory: 11,
  rivalRisk: -10,
};
/** Written before K-578751: six keys, out of 35 / 15 / 15 / 15 / 10. Hidden now. */
const LEGACY_MATCH = {
  topicExperience: 3,
  geographicBalance: 15,
  collabHistory: 0,
  relationshipWarmth: 5,
  centrality: 2,
  rivalRisk: -10,
};
/** Written by the retired consortium scorer (K-579560=A). Hidden now. */
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

function row(id: string, rank: number, breakdown: unknown, score = 50) {
  return { id, seatId: 's-1', rank, score, breakdown, organizationId: `org-${id}` };
}

/** Rendered rows of the page, keyed by the organisation id each row shows. */
async function renderRows(
  locale: 'tr' | 'en'
): Promise<{ html: string; totals: Record<string, string>; dimensions: Record<string, Record<string, string>> }> {
  const { default: MatchingPage } = await import('@/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page');
  const el = await MatchingPage({ params: Promise.resolve({ locale, workspace: 'main', id: 'o-1' }) });
  const html = renderToStaticMarkup(el as ReactElement);
  const host = document.createElement('div');
  host.innerHTML = html;
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
  return { html, totals, dimensions };
}

beforeEach(() => {
  candidates.rows = [
    row('match', 1, MATCH),
    row('consortium', 2, CONSORTIUM, 61.5),
    row('legacy', 3, { topicExperience: 3 }),
    row('old-match', 4, LEGACY_MATCH),
  ];
});

describe('matching page breakdown', () => {
  // Numbers follow the locale (FO-162): Turkish "3,0 / 34", English "3.0 / 34".
  it.each([
    ['tr', ',', '(aralık -10…0)'],
    ['en', '.', '(range -10…0)'],
  ] as const)('%s: only the current matcher\'s rows are shown, with its ranges', async (locale, sep, penalty) => {
    const n = (whole: number) => `${whole}${sep}0`;
    const { dimensions } = await renderRows(locale);

    // Only the current matcher's row is shown (K-579931=A): the other three are hidden.
    expect(Object.keys(dimensions)).toEqual(['org-match']);
    expect(dimensions['org-match']).toEqual({
      topicExperience: `${n(3)} / 34`,
      geographicBalance: `${n(33)} / 33`,
      collabHistory: `${n(11)} / 33`,
      rivalRisk: `${n(-10)} ${penalty}`,
    });
  });

  it.each([
    ['tr', 'önceki ölçütlerle'],
    ['en', 'previous criteria'],
  ] as const)('%s: a row from the old matcher is hidden, not shown with a note', async (locale, note) => {
    const { html } = await renderRows(locale);
    expect(html).not.toContain(note);
    expect(html).not.toContain('org-old-match');
    expect(html).not.toContain('org-consortium');
    expect(html).not.toContain('org-legacy');
  });

  it.each([
    ['tr', '61,5 / 100', '50,0 / 100'],
    ['en', '61.5 / 100', '50.0 / 100'],
  ] as const)('%s: the total uses the same number format as the dimensions', async (locale, fractional, whole) => {
    candidates.rows = [row('match', 1, MATCH, 61.5), row('match-2', 2, MATCH, 50)];
    const { totals } = await renderRows(locale);
    expect(totals['org-match']).toBe(fractional);
    expect(totals['org-match-2']).toBe(whole);
  });
});

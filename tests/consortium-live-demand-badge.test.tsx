// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * NG-100 / K-579560=A — the consortium page's live-demand badge.
 *
 * The retired consortium scorer put an open partner-search request into the score
 * (K-572451=A, `withLiveDemandSlot`). Under the one rule the request is no longer
 * scored; the page passes the organisations that have one (`liveDemandOrgIds`) and the
 * builder marks those candidates with an informational badge. The score itself does
 * not change.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions', () => ({
  addSeat: vi.fn(),
  findCandidates: vi.fn(),
  assignSeat: vi.fn(),
  confirmSeat: vi.fn(),
  getConflicts: vi.fn(async () => []),
}));

import ConsortiumManager from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager';

afterEach(cleanup);

const seat = {
  id: 's-1',
  tenantId: 't-1',
  opportunityId: 'o-1',
  role: null,
  roleKey: 'research',
  required: true,
  organizationId: null,
  status: 'OPEN',
  notes: null,
  invitedAt: null,
  confirmedAt: null,
};
const MATCH_BREAKDOWN = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };
const candidates = [
  { id: 'c-1', seatId: 's-1', organizationId: 'org-demand', rank: 1, score: 45, breakdown: MATCH_BREAKDOWN },
  { id: 'c-2', seatId: 's-1', organizationId: 'org-quiet', rank: 2, score: 45, breakdown: MATCH_BREAKDOWN },
];
const orgMap = {
  'org-demand': { id: 'org-demand', name: 'Demand Org', shortName: null, country: 'DE', isSme: false },
  'org-quiet': { id: 'org-quiet', name: 'Quiet Org', shortName: null, country: 'FR', isSme: false },
};

function renderBuilder(locale: 'tr' | 'en', liveDemandOrgIds?: string[]) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      <ConsortiumManager
        opportunityId="o-1"
        seats={[seat]}
        candidates={candidates}
        orgMap={orgMap}
        liveDemandOrgIds={liveDemandOrgIds}
      />
    </NextIntlClientProvider>
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('div')!.parentElement!;

describe('consortium builder — live-demand badge (NG-100, K-579560=A)', () => {
  it.each([
    ['tr', 'Canlı talep ilanı var'],
    ['en', 'Live partner request'],
  ] as const)('%s: only the candidate with an open request carries the badge', (locale, text) => {
    renderBuilder(locale, ['org-demand']);

    const badges = screen.getAllByTestId('live-demand-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent).toBe(text);
    expect(rowOf('Demand Org').contains(badges[0]!)).toBe(true);
    expect(rowOf('Quiet Org').querySelector('[data-testid="live-demand-badge"]')).toBeNull();
  });

  it('no request on the topic: no badge', () => {
    renderBuilder('en');
    expect(screen.queryByTestId('live-demand-badge')).toBeNull();
  });

  it('the badge does not move the score or the order', () => {
    renderBuilder('en', ['org-quiet']);
    const names = screen.getAllByText(/Demand Org|Quiet Org/).map((n) => n.textContent);
    expect(names).toEqual(['Demand Org', 'Quiet Org']);
    expect(screen.getAllByText(/45/).length).toBeGreaterThanOrEqual(2);
  });
});

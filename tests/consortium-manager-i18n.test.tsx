// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * FO-277 — the consortium builder's candidate "Invite" button and the
 * "Conflicts Detected" heading were hard-coded English, so a Turkish page showed
 * them in English. Both now come from the `Consortium` namespace.
 */

vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  consortiumLiveDemandWeight: undefined,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions', () => ({
  addSeat: vi.fn(),
  findCandidates: vi.fn(),
  assignSeat: vi.fn(),
  getConflicts: vi.fn(async () => []),
}));

import { findCandidates, getConflicts } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
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

async function openCandidates(locale: 'tr' | 'en') {
  const messages = locale === 'tr' ? trMessages : enMessages;
  vi.mocked(findCandidates).mockResolvedValueOnce([
    { organizationId: 'org-1', rank: 1, score: { total: 61.5 } },
  ] as unknown as Awaited<ReturnType<typeof findCandidates>>);
  vi.mocked(getConflicts).mockResolvedValueOnce(['org-1']);
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ConsortiumManager
        opportunityId="o-1"
        seats={[seat]}
        candidates={[]}
        orgMap={{ 'org-1': { id: 'org-1', name: 'Org One', shortName: null, country: 'DE', isSme: false } }}
      />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(messages.Consortium.findCandidates) }));
}

describe('consortium builder — invite button and conflict heading in the viewer locale', () => {
  it.each([
    ['tr', 'Davet Et', 'Çakışma Uyarısı'],
    ['en', 'Invite', 'Conflict Warning'],
  ] as const)('%s: invite button reads "%s", conflict heading "%s"', async (locale, invite, conflict) => {
    await openCandidates(locale);

    expect(await screen.findByRole('button', { name: invite })).toBeTruthy();
    // The ⚠ glyph is decorative (aria-hidden); the heading's name is the text alone.
    expect(await screen.findByRole('heading', { name: conflict })).toBeTruthy();
  });

  it('tr: no English label is left on the button or the heading', async () => {
    await openCandidates('tr');

    await screen.findByRole('button', { name: 'Davet Et' });
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull();
    expect(screen.queryByText(/Conflicts Detected/)).toBeNull();
  });
});

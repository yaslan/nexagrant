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
  confirmSeat: vi.fn(),
  getConflicts: vi.fn(async () => []),
}));

import { confirmSeat, findCandidates, getConflicts } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
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

/**
 * NG-28 — the confirmation button. The screen says CONFIRMED only after the server answered ok,
 * and a refusal is a sentence in the viewer's language.
 */
describe('consortium builder — seat confirmation', () => {
  const invited = { ...seat, status: 'INVITED', organizationId: 'org-1' };
  const orgMap = { 'org-1': { id: 'org-1', name: 'Org One', shortName: null, country: 'DE', isSme: false } };

  function renderSeat(locale: 'tr' | 'en', canConfirm: boolean | undefined, target = invited) {
    render(
      <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
        <ConsortiumManager opportunityId="o-1" seats={[target]} candidates={[]} orgMap={orgMap} canConfirm={canConfirm} />
      </NextIntlClientProvider>
    );
  }

  it.each([
    ['not told it may', undefined],
    ['told it may not', false],
  ])('no button when %s', (_label, canConfirm) => {
    renderSeat('tr', canConfirm);
    expect(screen.queryByTestId('m8-builder-seat-confirm')).toBeNull();
  });

  it.each(['OPEN', 'CANDIDATE', 'CONFIRMED', 'DECLINED'])('no button on a %s seat', (status) => {
    renderSeat('tr', true, { ...invited, status });
    expect(screen.queryByTestId('m8-builder-seat-confirm')).toBeNull();
  });

  it('no button on an invited seat that names no organisation', () => {
    renderSeat('tr', true, { ...invited, organizationId: null as unknown as string });
    expect(screen.queryByTestId('m8-builder-seat-confirm')).toBeNull();
  });

  it.each([
    ['tr', 'Kurum katılımını teyit etti', 'ONAYLANDI'],
    ['en', 'Organisation confirmed participation', 'CONFIRMED'],
  ] as const)('%s: asks for the organisation on screen, shows the status after ok, refreshes the conflicts', async (locale, label, confirmed) => {
    let answer!: (v: Awaited<ReturnType<typeof confirmSeat>>) => void;
    vi.mocked(confirmSeat).mockReturnValueOnce(new Promise((r) => { answer = r; }));
    vi.mocked(getConflicts).mockClear();
    renderSeat(locale, true);

    const button = screen.getByTestId('m8-builder-seat-confirm');
    expect(button.textContent).toBe(label);
    fireEvent.click(button);
    expect(vi.mocked(confirmSeat)).toHaveBeenLastCalledWith('s-1', 'o-1', 'org-1');
    // Not yet: the server has not answered.
    expect(screen.queryByText(confirmed)).toBeNull();

    answer({ ok: true });
    expect(await screen.findByText(confirmed)).toBeTruthy();
    expect(screen.queryByTestId('m8-builder-seat-confirm')).toBeNull();
    await vi.waitFor(() => expect(vi.mocked(getConflicts)).toHaveBeenCalledWith('o-1'));
  });

  it.each([
    ['tr', 'seatConfirmConflict', 'aynı çağrıda başka bir etkin fırsatta', 'DAVET EDİLDİ', 'ONAYLANDI'],
    ['en', 'seatConfirmConflict', 'another active opportunity on the same call', 'INVITED', 'CONFIRMED'],
    ['tr', 'seatNotConfirmable', 'Bu koltuğun durumu değişti', 'DAVET EDİLDİ', 'ONAYLANDI'],
    ['en', 'seatNotConfirmable', 'status of this seat has changed', 'INVITED', 'CONFIRMED'],
  ] as const)('%s, %s: the sentence, and the seat stays invited', async (locale, code, text, invitedLabel, confirmed) => {
    vi.mocked(confirmSeat).mockResolvedValueOnce({ ok: false, code });
    renderSeat(locale, true);

    fireEvent.click(screen.getByTestId('m8-builder-seat-confirm'));

    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect(screen.getByText(invitedLabel)).toBeTruthy();
    expect(screen.queryByText(confirmed)).toBeNull();
  });

  it('a role refusal from the server reads as the role sentence', async () => {
    vi.mocked(confirmSeat).mockRejectedValueOnce(Object.assign(new Error('x'), { digest: 'FORBIDDEN_ROLE' }));
    renderSeat('tr', true);

    fireEvent.click(screen.getByTestId('m8-builder-seat-confirm'));

    expect((await screen.findByRole('alert')).textContent).toBe(trMessages.Common.forbiddenRole);
    expect(screen.getByText('DAVET EDİLDİ')).toBeTruthy();
  });
});

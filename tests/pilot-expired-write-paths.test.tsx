// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * İNCELEME-24 B-1..B-3 (TASK-MUMT3HQI1ILAR) — the write paths the first pass
 * (TASK-MUMIIUEGJ6N8B, tests/pilot-expired-action-message.test.tsx) left out.
 * On an expired pilot each of them now shows `Common.pilotExpired`, not
 * "… Lütfen tekrar deneyin." and not nothing:
 *
 * - B-1: M11 application forms and the Part B editor (server actions that
 *   reject with `digest = 'PILOT_EXPIRED'`);
 * - B-2: the clients of `requireTenantApi({ write: true })` routes, which
 *   answer 403 `{ code: 'PILOT_EXPIRED' }` (member invite; the saved-search
 *   handlers on the calls page use the same three lines);
 * - B-3: the session-less partner portal, whose action only answers
 *   `{ success: false }`.
 *
 * İNCELEME-30 (TASK-MUN39FIAKFY2R) adds M8 matching: "Aday Bul" (a
 * value-returning form action, `code: 'pilotExpired'`) and "Davet Et" (was an
 * inline server-component form that only logged the refusal).
 * TASK-MUN3W76B4XEJE adds the consortium page's "Aday Bul", which had no catch
 * at all: a refusal went to the error boundary.
 */

const pilot = vi.hoisted(() => ({ expired: false }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));
vi.mock('@/modules/m11/server/actions', () => ({
  addBudgetLine: vi.fn(),
  addWorkPackage: vi.fn(),
  calculateLumpSumBudget: vi.fn(async () => 1000),
  addBudgetLineByToken: vi.fn(async () => ({ success: false })),
  acquireSectionLock: vi.fn(),
  releaseSectionLock: vi.fn(),
  updateSectionContent: vi.fn(),
  addSectionComment: vi.fn(),
  resolveSectionComment: vi.fn(),
  restoreSectionRevision: vi.fn(),
  updatePresenceHeartbeat: vi.fn(async () => []),
  generateSectionDraftAi: vi.fn(),
}));
vi.mock('@/modules/m8/server/actions', () => ({
  computeSeatCandidatesForm: vi.fn(),
  inviteCandidateToSeat: vi.fn(),
}));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions', () => ({
  addSeat: vi.fn(),
  findCandidates: vi.fn(),
  assignSeat: vi.fn(),
  getConflicts: vi.fn(async () => []),
}));
vi.mock('@/modules/m11/server/partner-link', () => ({ issuePartnerPortalLink: vi.fn() }));
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: vi.fn(async () => ({
    id: 'part-a',
    tenantId: 't-1',
    part: 'PART_A',
    content: { budget: [] },
    magicTokenHash: 'h',
    opportunity: { title: 'Fırsat' },
  })),
}));
vi.mock('@/lib/secret-token', () => ({ hashSecretToken: () => 'h', secretTokenMatches: () => true }));
vi.mock('@/lib/billing/pilot', () => ({
  getPilotState: vi.fn(async () =>
    pilot.expired ? { kind: 'expired', endsAt: new Date('2026-09-29T09:00:00Z') } : { kind: 'active', endsAt: new Date('2026-12-29T09:00:00Z') }
  ),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (arg: string | { locale: string; namespace: string }) => {
    const namespace = typeof arg === 'string' ? arg : arg.namespace;
    return createTranslator({ locale: 'tr', messages: trMessages, namespace: namespace as never });
  }),
}));

import { PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';
import { acquireSectionLock, addBudgetLine, addWorkPackage, updateSectionContent } from '@/modules/m11/server/actions';
import { ApplicationClient } from '@/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client';
import { PartBCollaborativeEditor } from '@/modules/m11/ui/PartBCollaborativeEditor';
import MembersSettingsPage from '@/app/[locale]/(app)/[workspace]/settings/members/page';
import CallsPage from '@/app/[locale]/(app)/[workspace]/calls/page';
import PartnerPortalPage from '@/app/[locale]/portal/partner/[token]/page';
import { computeSeatCandidatesForm, inviteCandidateToSeat } from '@/modules/m8/server/actions';
import FindCandidatesButton from '@/modules/m8/components/find-candidates-button';
import InviteCandidateButton from '@/modules/m8/components/invite-candidate-button';
import { assignSeat, findCandidates } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
import ConsortiumManager from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager';

const PILOT_TR = trMessages.Common.pilotExpired;
const PILOT_EN = enMessages.Common.pilotExpired;
/** What the browser receives in production for a refused action: no message, only the digest. */
const refused = () =>
  Object.assign(new Error('An error occurred in the Server Components render.'), { digest: PILOT_EXPIRED_DIGEST });

function withIntl(node: React.ReactNode, locale: 'tr' | 'en' = 'tr') {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

/**
 * A button stays disabled while its action is pending, and React drops a click
 * on a disabled button. The alert can render before the pending flag clears,
 * so a second click has to wait for the button (TASK-MUN7B4ZIEBJML).
 */
async function enabled(button: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  return button;
}

beforeEach(() => {
  pilot.expired = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('B-1: M11 application screen', () => {
  const parts = {
    opportunityId: 'o-1',
    tenantId: 't-1',
    opportunityTitle: 'Fırsat',
    partA: { id: 'part-a', part: 'PART_A', content: {} },
    partB: { id: 'part-b', part: 'PART_B', content: {} },
  };

  test('budget line: a refused add says the pilot ended; the line is not added', async () => {
    vi.mocked(addBudgetLine).mockRejectedValueOnce(refused());
    render(withIntl(<ApplicationClient {...parts} />));
    fireEvent.click(screen.getByRole('button', { name: /Part A \(İdari/ }));
    fireEvent.change(screen.getByPlaceholderText('Örn: METU TTO, Fraunhofer Institute'), { target: { value: 'Ortak' } });
    fireEvent.click(screen.getByRole('button', { name: /Bütçe Kalemini Kaydet/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));
    expect(screen.queryByText('Ortak', { selector: 'td, td *' })).toBeNull();
  });

  test('work package: a refused add says the pilot ended; any other failure stays silent, as before', async () => {
    vi.mocked(addWorkPackage).mockRejectedValueOnce(refused());
    render(withIntl(<ApplicationClient {...parts} />));
    fireEvent.click(screen.getByRole('button', { name: /Gantt Şeması & İş Paketleri/ }));
    // Submitted directly: the required code/title inputs have no label to type into by.
    fireEvent.submit(screen.getByRole('button', { name: /İş Paketini Gantt Şemasına Ekle/ }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));

    vi.mocked(addWorkPackage).mockRejectedValueOnce(Object.assign(new Error('x'), { digest: '4242' }));
    fireEvent.submit(screen.getByRole('button', { name: /İş Paketini Gantt Şemasına Ekle/ }).closest('form')!);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  test('Part B editor: a refused lock and a refused save both say the pilot ended', async () => {
    vi.mocked(acquireSectionLock).mockRejectedValueOnce(refused());
    render(withIntl(<PartBCollaborativeEditor partId="part-b" tenantId="t-1" opportunityTitle="Fırsat" />));
    fireEvent.click(screen.getByRole('button', { name: /Bölümü Kilitle/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));

    vi.mocked(updateSectionContent).mockRejectedValueOnce(refused());
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(vi.mocked(updateSectionContent)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));
  });
});

describe('B-2: a 403 PILOT_EXPIRED from a write route', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const PILOT_BODY = { error: 'Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur. Verileriniz korunuyor.', code: 'PILOT_EXPIRED' };

  test('saved search (calls page): the pilot sentence instead of "… Lütfen tekrar deneyin."', async () => {
    let saveAnswer = () => json(PILOT_BODY, 403);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/saved-searches' && init?.method === 'POST') return saveAnswer();
        if (url === '/api/saved-searches') return json({ success: true, searches: [] });
        return json({ success: true, topics: [], total: 0 });
      })
    );
    render(withIntl(<CallsPage />));
    fireEvent.click(screen.getByTestId('calls-save-search'));
    await waitFor(() => expect(screen.getByTestId('calls-save-search-error').textContent).toBe(PILOT_TR));

    saveAnswer = () => json({ success: false, error: 'db down' }, 500);
    await waitFor(() => expect((screen.getByTestId('calls-save-search') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('calls-save-search'));
    await waitFor(() =>
      expect(screen.getByTestId('calls-save-search-error').textContent).toBe(trMessages.callsPage.saveSearchError)
    );
  });

  test('member invite (en): the English pilot sentence, not the Turkish body text', async () => {
    // The page also reads the team list (GET /api/team, read-only: still 200
    // for an expired pilot); only the invite write answers with the refusal.
    const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string }) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({ error: 'Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur. Verileriniz korunuyor.', code: 'PILOT_EXPIRED' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        : new Response(JSON.stringify({ me: { userId: 'u', role: 'TENANT_OWNER' }, members: [], invitations: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(withIntl(<MembersSettingsPage />, 'en'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_EN));

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Error: Invalid email'));
  });
});

describe('B-3: partner portal', () => {
  const page = () => PartnerPortalPage({ params: Promise.resolve({ token: 'tok', locale: 'tr' }) });

  test('an expired pilot: the notice is shown and the form is closed', async () => {
    pilot.expired = true;
    render(await page());
    expect(screen.getByRole('alert').textContent).toBe(PILOT_TR);
    expect(screen.getByRole('button', { name: trMessages.partner_portal.submit_button }).matches(':disabled')).toBe(true);
  });

  test('a running pilot: no notice, the form is open', async () => {
    render(await page());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: trMessages.partner_portal.submit_button }).matches(':disabled')).toBe(false);
  });
});

describe('İNCELEME-30: M8 matching', () => {
  test('"Aday Bul": a pilot refusal says the pilot ended; other failures get their own translated sentence, never the caught text', async () => {
    vi.mocked(computeSeatCandidatesForm).mockResolvedValueOnce({ status: 'error', code: 'pilotExpired' });
    render(withIntl(<FindCandidatesButton opportunityId="o-1" seatId="s-1" />));
    fireEvent.click(screen.getByRole('button', { name: trMessages.Consortium.findCandidates }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));

    vi.mocked(computeSeatCandidatesForm).mockResolvedValueOnce({ status: 'error', code: 'seatNotFound' });
    // While pending the button reads "computing", so find it by its idle name.
    fireEvent.click(await enabled(await screen.findByRole('button', { name: trMessages.Consortium.findCandidates })));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(trMessages.Consortium.seatNotFound));

    vi.mocked(computeSeatCandidatesForm).mockResolvedValueOnce({ status: 'error', code: 'computeFailed' });
    fireEvent.click(await enabled(await screen.findByRole('button', { name: trMessages.Consortium.findCandidates })));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(trMessages.Consortium.computeFailed));
  });

  test('"Davet Et" (en): a refused invite shows the pilot sentence instead of nothing; other failures stay silent', async () => {
    vi.mocked(inviteCandidateToSeat).mockRejectedValueOnce(refused());
    render(withIntl(<InviteCandidateButton seatId="s-1" organizationId="999" opportunityId="o-1" />, 'en'));
    fireEvent.click(screen.getByRole('button', { name: enMessages.Consortium.invite }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_EN));
    expect(vi.mocked(inviteCandidateToSeat)).toHaveBeenCalledWith('s-1', '999', 'o-1');

    vi.mocked(inviteCandidateToSeat).mockRejectedValueOnce(Object.assign(new Error('x'), { digest: '4242' }));
    fireEvent.click(await enabled(screen.getByRole('button', { name: enMessages.Consortium.invite })));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('TASK-MUN3W76B4XEJE: consortium page', () => {
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
  const kept = { id: 'c-1', seatId: 's-1', organizationId: 'org-kept', rank: 1, score: 2 };

  test.each([
    ['tr', trMessages, PILOT_TR],
    ['en', enMessages, PILOT_EN],
  ] as const)('"Aday Bul" (%s): a refused search says the pilot ended and keeps the listed candidates', async (locale, messages, sentence) => {
    vi.mocked(findCandidates).mockRejectedValueOnce(refused());
    render(
      withIntl(<ConsortiumManager opportunityId="o-1" seats={[seat]} candidates={[kept]} orgMap={{}} />, locale)
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(messages.Consortium.findCandidates) }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(sentence));
    expect(vi.mocked(findCandidates)).toHaveBeenCalledWith('s-1');
    expect(screen.getByText('org-kept')).toBeTruthy();
  });

  test('"Invite": a refused invite (success: false) does not show the seat as INVITED (TASK-MUN509G2ICKWI)', async () => {
    const status = trMessages.Consortium.status;
    vi.mocked(findCandidates).mockResolvedValueOnce([
      { organizationId: 'org-new', rank: 1, score: { total: 3 } },
    ] as unknown as Awaited<ReturnType<typeof findCandidates>>);
    vi.mocked(assignSeat).mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    render(withIntl(<ConsortiumManager opportunityId="o-1" seats={[seat]} candidates={[]} orgMap={{}} />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(trMessages.Consortium.findCandidates) }));
    // The candidate list renders while the search transition still awaits
    // getConflicts(), so "Invite" first appears disabled; a click then is
    // dropped and assignSeat never runs. Click only once it is enabled
    // (TASK-MUN7B4ZIEBJML: the full-suite "timed out in 5000ms").
    const invite = await enabled(await screen.findByRole('button', { name: 'Invite' }));

    fireEvent.click(invite);
    await waitFor(() => expect(vi.mocked(assignSeat)).toHaveBeenCalledTimes(1));
    await enabled(invite);
    expect(vi.mocked(assignSeat)).toHaveBeenCalledWith('s-1', 'org-new');
    expect(screen.getByText(status.OPEN)).toBeTruthy();
    expect(screen.queryByText(status.INVITED)).toBeNull();

    fireEvent.click(invite);
    await waitFor(() => expect(screen.getByText(status.INVITED)).toBeTruthy());
  });
});

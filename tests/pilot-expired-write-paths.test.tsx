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
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: 'Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur. Verileriniz korunuyor.', code: 'PILOT_EXPIRED' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
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

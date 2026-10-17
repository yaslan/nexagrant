import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TASK-MUO2B59ZNY7D7 (İNCELEME-81 Ö-3) — once the membership is written, a
 * failure to re-mint the session cookie must not turn the accept into an error
 * page: the membership stands, the next sign-in finds it, so the person still
 * goes to the workspace. Everything but the action is replaced.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  unstable_update: vi.fn(),
  acceptInvitation: vi.fn(),
  readParkedInvitation: vi.fn(),
  clearInvitationAcceptCookie: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
}));

vi.mock('@/lib/auth', () => ({ auth: m.auth, unstable_update: m.unstable_update, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/invitations/accept', () => ({ acceptInvitation: m.acceptInvitation }));
vi.mock('@/lib/invitations/accept-cookie', () => ({
  readParkedInvitation: m.readParkedInvitation,
  clearInvitationAcceptCookie: m.clearInvitationAcceptCookie,
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/agency/registration-invite-cookie', () => ({ setRegistrationInviteCookie: vi.fn() }));
vi.mock('@/lib/legal/consent-documents', () => ({ acknowledgementMatchesCurrent: vi.fn() }));
vi.mock('@/lib/legal/registration-ack-cookie', () => ({
  clearRegistrationAcknowledgementCookie: vi.fn(),
  setRegistrationAcknowledgementCookie: vi.fn(),
}));
vi.mock('@/lib/registration-province-cookie', () => ({ setRegistrationProvinceCookie: vi.fn() }));
vi.mock('@/lib/registration-readiness-cookie', () => ({ setRegistrationReadinessCookie: vi.fn() }));

import { acceptInvitationAction } from '@/app/[locale]/(public)/accept-invite/continue/actions';

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    return `ok:${JSON.stringify(await p)}`;
  } catch (e) {
    return `throw:${(e as Error).message}`;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: 'u1', email: 'a@example.invalid' }, tenantId: 't1' });
  m.readParkedInvitation.mockResolvedValue({ token: 'parked', locale: 'tr' });
  m.acceptInvitation.mockResolvedValue({ ok: true, tenantId: 't2', role: 'PIPELINE_MANAGER' });
});

describe('accepting an invitation when the session cannot be re-minted (İNCELEME-81 Ö-3)', () => {
  it('control: the rebind asks for the accepted tenant, then the workspace opens', async () => {
    m.unstable_update.mockResolvedValue(null);
    expect(await outcome(acceptInvitationAction('tr'))).toBe('throw:NEXT_REDIRECT;/tr/default/panel');
    expect(m.unstable_update).toHaveBeenCalledWith({ tenantId: 't2' });
  });

  it('the rebind throws: logged by name only, and the workspace still opens', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('postgres://user:secret@db/fabrika is down');
    failure.name = 'RebindError';
    m.unstable_update.mockRejectedValue(failure);
    expect(await outcome(acceptInvitationAction('en'))).toBe('throw:NEXT_REDIRECT;/en/default/dashboard');
    expect(m.clearInvitationAcceptCookie).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[AcceptInvite] session rebind failed: RebindError');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret');
  });
});

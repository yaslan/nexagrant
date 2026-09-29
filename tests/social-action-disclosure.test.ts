import { expect, test, vi } from 'vitest';
import { createTranslator } from 'next-intl';

import en from '../messages/en.json';
import tr from '../messages/tr.json';

/**
 * İNCELEME-13 Ö-2 (TASK-MUM676F010E9G) — `loginWithSocialAction` refuses a
 * code without the addendum-bearing tick with the message the registration
 * screen already shows, `Auth.disclosureRequiredAgency`, not a copy of it.
 *
 * `getTranslations` only runs under the react-server condition, so it is
 * stood in for by next-intl's own `createTranslator` over the real message
 * files: what is checked is the key and the locale the action asks for.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'tr' | 'en'; namespace: 'Auth' }) =>
    createTranslator({ locale, messages: locale === 'en' ? en : tr, namespace }),
}));
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
// Stands in for the redirect to Google: what is checked is the cookie jar the
// action leaves behind at the moment it hands over.
const signIn = vi.hoisted(() => vi.fn(async (_provider: string, _options: { redirectTo: string }) => {}));
vi.mock('@/lib/auth', () => ({ signIn, signOut: vi.fn() }));

test('a code without the addendum tick: refused before the redirect, in the reader’s language, nothing parked', async () => {
  const { loginWithSocialAction } = await import('../src/lib/actions/auth');
  for (const locale of ['tr', 'en'] as const) {
    const res = await loginWithSocialAction('google', `/${locale}/dashboard`, undefined, undefined, undefined, 'ABCD-EFGH', locale);
    expect(res).toEqual({ error: (locale === 'en' ? en : tr).Auth.disclosureRequiredAgency });
  }
  expect([...jar.keys()]).toEqual([]);
});

/**
 * TASK-MUN2793A57Z9I (İNCELEME-34 B-1, mutant N2) — a tenant invitation rides
 * only on the start from its own accept screen. The plain `/giris` / `/kayit`
 * Google start clears a parked one, else an accept screen opened and abandoned
 * in this browser turns the next Google sign-up into a join attempt.
 */
test('a plain Google start clears a parked tenant invitation before handing over to Google', async () => {
  const { loginWithSocialAction } = await import('../src/lib/actions/auth');
  const { INVITATION_ACCEPT_COOKIE, encodeParkedInvitation } = await import('../src/lib/invitations/accept-cookie');
  const { registrationAcknowledgementToken } = await import('../src/lib/legal/consent-documents');
  for (const acknowledgement of [undefined, registrationAcknowledgementToken()]) {
    jar.clear();
    signIn.mockClear();
    jar.set(INVITATION_ACCEPT_COOKIE, encodeParkedInvitation({ token: 'a'.repeat(64), locale: 'tr' }));
    let parkedAtHandover: boolean | undefined;
    signIn.mockImplementationOnce(async () => {
      parkedAtHandover = jar.has(INVITATION_ACCEPT_COOKIE);
    });
    await loginWithSocialAction('google', '/tr/dashboard', acknowledgement, undefined, undefined, undefined, 'tr');
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(parkedAtHandover).toBe(false);
  }
});

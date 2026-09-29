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

test('a code without the addendum tick: refused before the redirect, in the reader’s language, nothing parked', async () => {
  const { loginWithSocialAction } = await import('../src/lib/actions/auth');
  for (const locale of ['tr', 'en'] as const) {
    const res = await loginWithSocialAction('google', `/${locale}/dashboard`, undefined, undefined, undefined, 'ABCD-EFGH', locale);
    expect(res).toEqual({ error: (locale === 'en' ? en : tr).Auth.disclosureRequiredAgency });
  }
  expect([...jar.keys()]).toEqual([]);
});

import { afterEach, describe, expect, it, vi } from 'vitest';
// Static import: React's JSX runtime picks its build from NODE_ENV when it is
// first loaded, so the page must load before a test stubs NODE_ENV to production.
import I18nCheckPage from '@/app/[locale]/(public)/i18n-check/page';

/**
 * TASK-MWAWHQXQT38RW (NG-117) — /[locale]/i18n-check prints the internal
 * inventory of missing translation keys (names and counts). In production it
 * must answer 404; in development and test it stays open, because the e2e
 * shell spec and local work still read it.
 */

const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404';

vi.mock('next/navigation', () => ({
  notFound: () => {
    const err = new Error('NEXT_NOT_FOUND') as Error & { digest: string };
    err.digest = NOT_FOUND_DIGEST;
    throw err;
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

function callPage(locale: string) {
  return I18nCheckPage({ params: Promise.resolve({ locale }) });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('i18n-check page visibility (NG-117)', () => {
  it('production: answers 404 instead of listing missing keys', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await expect(callPage('tr')).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });
    await expect(callPage('en')).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });
  });

  it('development: stays open and renders the page', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const el = await callPage('tr');
    expect(el).toBeTruthy();
  });
});

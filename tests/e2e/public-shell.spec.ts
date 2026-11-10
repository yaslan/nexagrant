import { test, expect, type Page } from '@playwright/test';

/**
 * TASK-MVCHFXFWAVSDT (FO-68) — every public page carries the site header and
 * footer, exactly once.
 *
 * Before, each page mounted `PublicNavbar`/`PublicFooter` itself, so the set
 * drifted: the legal pages, the calls index and regions, no-workspace and the
 * invitation screen went out with neither, `/calls` drew a header of its own,
 * and the 404 page had no way back but one button. The pair now lives in one
 * place, `src/app/[locale]/(public)/layout.tsx` (and `src/app/not-found.tsx`,
 * which sits above `[locale]`), and pages must not add their own.
 *
 * Counted twice: as the components (`data-testid`), so a copy mounted anywhere
 * shows up, and as landmarks — `banner` and `contentinfo` — because that is what
 * a screen reader user navigates by. A `<header>` inside `<main>` (a page's own
 * heading block) is not a banner, so it does not count there. URLs are the ones people use, TR slugs included, so the
 * rewrites in next.config.ts are exercised too.
 */

const PUBLIC_URLS: Record<'tr' | 'en', string[]> = {
  tr: [
    '/tr',
    '/tr/gizlilik-politikasi',
    '/tr/kullanim-kosullari',
    '/tr/veri-isleme-sozlesmesi',
    '/tr/fiyatlandirma',
    '/tr/acik-cagrilar',
    '/tr/belediye-cagrilari',
    '/tr/calls',
    '/tr/calls/turkey',
    '/tr/calls/germany',
    '/tr/fon-hazirlik',
    '/tr/blog',
    '/tr/giris',
    '/tr/kayit',
    '/tr/uzman',
    '/tr/uzman/dogrulandi',
    '/tr/no-workspace',
    '/tr/accept-invite/continue',
  ],
  en: [
    '/en',
    '/en/privacy',
    '/en/terms',
    '/en/compliance/dpa',
    '/en/pricing',
    '/en/open-calls',
    '/en/municipal-calls',
    '/en/calls',
    '/en/calls/turkey',
    '/en/calls/germany',
    '/en/funding-readiness',
    '/en/blog',
    '/en/login',
    '/en/register',
    '/en/experts',
    '/en/experts/verified',
    '/en/no-workspace',
    '/en/accept-invite/continue',
  ],
};

/**
 * NG-117: the i18n-check page lists internal translation keys. A production
 * build answers 404 for it (src/app/[locale]/(public)/i18n-check/page.tsx), so
 * under `E2E_WEB_SERVER=start` it moves from the shell list to the 404 list.
 */
const TR_I18N_CHECK = '/tr/i18n-check';
const EN_I18N_CHECK = '/en/i18n-check';
const PRODUCTION_BUILD = process.env.E2E_WEB_SERVER === 'start';

if (!PRODUCTION_BUILD) {
  PUBLIC_URLS.tr.push(TR_I18N_CHECK);
  PUBLIC_URLS.en.push(EN_I18N_CHECK);
}

/** 404s: an unrouted path, and a `notFound()` thrown from inside the public group. */
const NOT_FOUND_URLS = [
  '/tr/boyle-bir-sayfa-yok-fo68',
  '/en/no-such-page-fo68',
  '/tr/portal/partner/fo68-no-such-token',
  '/en/blog/fo68-no-such-post',
  ...(PRODUCTION_BUILD ? [TR_I18N_CHECK, EN_I18N_CHECK] : []),
];

async function expectOneShell(page: Page, url: string): Promise<void> {
  // The components themselves, wherever they are mounted: a second navbar put
  // inside a page's <main> is no longer a banner landmark and would slip past
  // the role counts below (measured with a mutant).
  await expect(page.getByTestId('public-navbar'), `${url}: navbar count`).toHaveCount(1);
  await expect(page.getByTestId('public-footer'), `${url}: footer component count`).toHaveCount(1);
  await expect(page.getByRole('banner'), `${url}: header count`).toHaveCount(1);
  await expect(page.getByRole('contentinfo'), `${url}: footer count`).toHaveCount(1);
  await expect(page.getByRole('main'), `${url}: main count`).toHaveCount(1);
}

test.describe('public pages share one header and one footer (FO-68)', () => {
  test.beforeEach(async ({ page }) => {
    // The cookie banner is a full-screen alertdialog that swallows clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale}: every public page has exactly one header and one footer`, async ({ page }) => {
      test.setTimeout(300_000);
      for (const url of PUBLIC_URLS[locale]) {
        const response = await page.goto(url);
        expect(response!.status(), `${url} must answer 200`).toBe(200);
        expect(new URL(page.url()).pathname, `${url} must not redirect`).toBe(url);
        await expectOneShell(page, url);
      }

      // A post: the slug comes from the list, which the seed fills.
      await page.goto(`/${locale}/blog`);
      const post = page.locator(`main a[href^="/${locale}/blog/"]`).first();
      const href = await post.getAttribute('href');
      expect(href, `/${locale}/blog lists no post to open`).toBeTruthy();
      const response = await page.goto(href!);
      expect(response!.status()).toBe(200);
      await expectOneShell(page, href!);
    });
  }

  test('the 404 page has the header and footer too', async ({ page }) => {
    for (const url of NOT_FOUND_URLS) {
      const response = await page.goto(url);
      expect(response!.status(), `${url} must answer 404`).toBe(404);
      await expectOneShell(page, url);
    }
  });

  test('the footer legal links open their own page in each language', async ({ page }) => {
    const cases = [
      { from: '/tr/fiyatlandirma', link: 'Gizlilik Politikası (KVKK/GDPR)', heading: /Gizlilik Politikası/ },
      { from: '/tr/giris', link: 'Kullanım Koşulları', heading: /Kullanım Koşulları/ },
      { from: '/tr/boyle-bir-sayfa-yok-fo68', link: 'Veri İşleme Sözleşmesi (DPA)', heading: /Veri İşleme Sözleşmesi/ },
      { from: '/en/pricing', link: 'Privacy Policy', heading: /Privacy Policy/ },
      { from: '/en/login', link: 'Terms of Service', heading: /Terms of Service/ },
      { from: '/en/no-such-page-fo68', link: 'Data Processing Agreement', heading: /Data Processing Agreement/ },
    ];
    for (const c of cases) {
      await page.goto(c.from);
      await page.getByRole('contentinfo').getByRole('link', { name: c.link }).click();
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible();
      await expectOneShell(page, page.url());
    }
  });
});

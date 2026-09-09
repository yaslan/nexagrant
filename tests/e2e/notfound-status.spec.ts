import { test, expect } from '@playwright/test';

import {
  NF_WORKSPACE,
  setupNotFoundTenant,
  signInAsNotFoundUser,
  teardownNotFoundTenant,
} from './fixtures/notfound-tenant';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTRNO3LBZB2Q7 — `notFound()` under `(app)` must answer HTTP 404 to a
 * SIGNED-IN request.
 *
 * The card was once closed as "already 404". That measurement was taken signed
 * out, where the `(app)` layout redirects to the login page (307) and the
 * page's `notFound()` never runs — so it proved nothing about the status. This
 * spec signs in first, which is the only state in which the defect is visible.
 *
 * The cause was a single `loading.tsx` at `[locale]/(app)/[workspace]`: a
 * Suspense boundary above every workspace route makes Next flush the shell —
 * and the 200 status line — before the page has decided whether the record
 * exists. The skeleton was first moved down to the sections with no
 * lookup-decided child; TASK-MTU4AYW5R9DGL then removed it from those too,
 * because the same early flush also leaves a hidden duplicate of the whole
 * page in the DOM. There is now no `loading.tsx` under `(app)` at all —
 * tests/app-shell-no-loading-boundary.test.ts keeps it that way, and a
 * boundary re-added above a `[param]` segment turns these assertions red,
 * which is the point.
 */

const MISSING = 'nf-e2e-does-not-exist';

/** Every `(app)` route whose existence is decided by a lookup. */
const NOT_FOUND_ROUTES = [
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/briefs`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/documents`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/application`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/evaluations`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/evaluations/panel`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/m2`,
  `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/matching`,
  `/tr/${NF_WORKSPACE}/pipeline/${MISSING}`,
  `/tr/${NF_WORKSPACE}/pipeline/${MISSING}/consortium`,
  `/tr/${NF_WORKSPACE}/partners/${MISSING}`,
  `/tr/${NF_WORKSPACE}/relationships/${MISSING}`,
];

/** Routes that exist; they must not be dragged into a 404 by the fix. */
const OK_ROUTES = [
  `/tr/${NF_WORKSPACE}/dashboard`,
  `/tr/${NF_WORKSPACE}/pipeline`,
  `/tr/${NF_WORKSPACE}/partners`,
  `/tr/${NF_WORKSPACE}/relationships`,
  `/tr/${NF_WORKSPACE}/notifications`,
  `/tr/${NF_WORKSPACE}/evidence`,
  `/tr/${NF_WORKSPACE}/settings/profile`,
];

test.describe('notFound() answers 404 to a signed-in request', () => {
  test.beforeAll(setupNotFoundTenant);
  test.afterAll(teardownNotFoundTenant);

  test('an unknown id under (app) is 404, and the routes that exist stay 200', async ({ page }) => {
    test.setTimeout(180_000);

    await signInAsNotFoundUser(page, `/tr/${NF_WORKSPACE}/dashboard`);

    for (const route of NOT_FOUND_ROUTES) {
      const response = await page.goto(route);
      expect(response, `no response for ${route}`).not.toBeNull();
      expect(response!.status(), `${route} must answer 404`).toBe(404);
      await expect(page.getByText('Sayfa Bulunamadı')).toBeVisible();
    }

    for (const route of OK_ROUTES) {
      const response = await page.goto(route);
      expect(response!.status(), `${route} must stay 200`).toBe(200);
    }
  });

  test('signed out, the same URLs redirect and never reach notFound()', async ({ browser }) => {
    // Recorded, not incidental: this is the state the card was wrongly closed
    // in. A 307 here means the request stopped at the auth redirect, so it says
    // nothing about the `notFound()` status.
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const route of NOT_FOUND_ROUTES.slice(0, 3)) {
      const response = await page.goto(route);
      expect(response!.url()).toContain('/giris');
    }
    await context.close();
  });
});

/**
 * TASK-MTS6MMOD8XF3A — the same page must answer in the reader's own language.
 *
 * `not-found.tsx` sits *above* the `[locale]` segment, so it has no route param
 * to read the language from; it asks `getLocale()`, which resolves the request
 * locale the proxy negotiated. That indirection is the part worth guarding: a
 * `getRequestConfig` that stops honouring `requestLocale`, or a proxy matcher
 * that stops seeing the 404 request, both fail silently — the page still
 * renders, just always in the default locale (Turkish).
 *
 * Measured signed IN, like the status assertions above. Signed out the `(app)`
 * routes never reach the page at all, so a signed-out pass proves nothing.
 */
const LOCALE_CASES = [
  {
    locale: 'tr',
    // A workspace route whose id does not exist: `notFound()` from inside (app).
    lookup: `/tr/${NF_WORKSPACE}/opportunities/${MISSING}/briefs`,
    // A path that matches no route at all: Next's own not-found dispatch.
    unrouted: '/tr/boyle-bir-sayfa-yok-404',
    title: 'Sayfa Bulunamadı',
    cta: 'Ana Sayfaya Dön',
    foreignTitle: 'Page Not Found',
  },
  {
    locale: 'en',
    lookup: `/en/${NF_WORKSPACE}/opportunities/${MISSING}/briefs`,
    unrouted: '/en/no-such-page-404',
    title: 'Page Not Found',
    cta: 'Back to Home',
    foreignTitle: 'Sayfa Bulunamadı',
  },
] as const;

test.describe('the 404 page speaks the URL\'s language', () => {
  test.beforeAll(setupNotFoundTenant);
  test.afterAll(teardownNotFoundTenant);

  test('both locales render their own copy, and the way home keeps the locale', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await signInAsNotFoundUser(page, `/tr/${NF_WORKSPACE}/dashboard`);

    for (const c of LOCALE_CASES) {
      for (const url of [c.lookup, c.unrouted]) {
        const response = await page.goto(url);
        expect(response!.status(), `${url} must answer 404`).toBe(404);

        await expect(page.locator('html')).toHaveAttribute('lang', c.locale);
        await expect(page.getByRole('heading', { name: c.title })).toBeVisible();
        await expect(page.getByText(c.foreignTitle)).toHaveCount(0);

        // The way out must not drop the reader into the other language.
        const home = page.getByRole('link', { name: c.cta });
        await expect(home).toBeVisible();
        await expect(home).toHaveAttribute('href', `/${c.locale}`);
      }

      await page.goto(c.lookup);
      await page.screenshot({
        path: `${shotsDir('TASK-MTS6MMOD8XF3A-screenshots')}/03-404-signed-in-${c.locale}.png`,
        fullPage: true,
      });
    }
  });
});

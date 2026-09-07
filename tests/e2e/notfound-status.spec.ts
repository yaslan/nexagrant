import { test, expect } from '@playwright/test';

import {
  NF_WORKSPACE,
  setupNotFoundTenant,
  signInAsNotFoundUser,
  teardownNotFoundTenant,
} from './fixtures/notfound-tenant';

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
 * exists. The skeleton now lives on the sections that have no lookup-decided
 * child; a `loading.tsx` re-added above a `[param]` segment turns these
 * assertions red, which is the point.
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

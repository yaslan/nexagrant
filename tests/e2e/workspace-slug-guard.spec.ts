import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './fixtures/session';
import {
  WSG_FOREIGN,
  WSG_OWN,
  WSG_UNCOVERED,
  setupWorkspaceSlugGuard,
  signInAsWorkspaceSlugGuardUser,
  teardownWorkspaceSlugGuard,
} from './fixtures/workspace-slug-guard';

/**
 * TASK-MUUS62C4SC7H5 — the `[workspace]` URL segment is checked against the
 * session's tenant and membership in `[workspace]/layout.tsx`.
 *
 * Both directions are asserted: a slug that is not the user's is 404, and the
 * user's own workspace and the `default` alias stay 200 on the URL they asked for.
 * The second half is what a guard in the wrong layout breaks — placed in
 * `(app)/layout.tsx` it never sees the segment and sent every page to `/<slug>`.
 */

async function expectStatus(page: Page, path: string, status: number) {
  const response = await page.goto(path);
  expect(response, `no response for ${path}`).not.toBeNull();
  expect(response!.status(), `${path} must answer ${status}`).toBe(status);
  if (status === 404) {
    await expect(page.getByText('Sayfa Bulunamadı')).toBeVisible();
  } else {
    // No redirect: the page answered on the URL that was asked for.
    expect(new URL(page.url()).pathname).toBe(path);
  }
}

test.describe('Workspace slug guard', () => {
  test.beforeAll(setupWorkspaceSlugGuard);
  test.afterAll(teardownWorkspaceSlugGuard);

  test.beforeEach(async ({ page }) => {
    await signInAsWorkspaceSlugGuardUser(page);
  });

  test('own workspace answers 200 without a redirect', async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, `/tr/${WSG_OWN.slug}/dashboard`, 200);
    await expectStatus(page, `/tr/${WSG_OWN.slug}/notifications`, 200);
  });

  test('the default alias keeps its meaning: 200, no redirect', async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, '/tr/default/dashboard', 200);
  });

  test("another tenant's workspace slug is 404", async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, `/tr/${WSG_FOREIGN.slug}/dashboard`, 404);
    await expectStatus(page, `/tr/${WSG_FOREIGN.slug}/notifications`, 404);
  });

  test("a workspace of the user's tenant outside the membership is 404", async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, `/tr/${WSG_UNCOVERED.slug}/dashboard`, 404);
  });

  test('a slug that names no workspace is 404', async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, '/tr/wsg-e2e-does-not-exist/dashboard', 404);
  });

  test('a segment outside the slug grammar is 404', async ({ page }) => {
    test.setTimeout(120_000);
    await expectStatus(page, '/tr/%C3%A7al%C4%B1%C5%9Fma/dashboard', 404);
  });
});

/**
 * The seeded demo owner, signed in with the identity `pnpm db:seed` writes — no
 * fixture rows. Read-only: demo-tenant is not modified.
 */
test.describe('Workspace slug guard — seeded identity', () => {
  test('the seeded owner reaches their own workspace', async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, {
      id: 'demo-user-superadmin',
      email: 'admin@yasinaslan.com.tr',
      tenantId: 'demo-tenant',
      role: 'TENANT_OWNER',
    });
    await expectStatus(page, '/tr/main/dashboard', 200);
    await expectStatus(page, '/en/main/notifications', 200);
  });
});

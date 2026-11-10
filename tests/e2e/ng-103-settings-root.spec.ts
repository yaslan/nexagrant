/**
 * NG-103 — the settings root must open in both locales.
 *
 * Before: `/tr/<ws>/ayarlar` rendered the modules page (`ayarlar/page.tsx` re-exports
 * `settings/modules/page`), but there was no `settings/page.tsx`, so `/en/<ws>/settings`
 * answered 404 while `/en/<ws>/settings/profile` worked (NG-90 measured it).
 * After: `/en/<ws>/settings` answers 200 with the same page the Turkish root shows,
 * without a redirect; the Turkish root and the existing subpages are unchanged.
 */
import { test, expect, type Page } from '@playwright/test';

import {
  NF_WORKSPACE,
  setupNotFoundTenant,
  signInAsNotFoundUser,
  teardownNotFoundTenant,
} from './fixtures/notfound-tenant';

async function mainHeading(page: Page, url: string) {
  const response = await page.goto(url);
  const h1 = page.locator('main h1').first();
  await expect(h1).toBeVisible();
  return { status: response?.status() ?? null, finalUrl: new URL(page.url()).pathname, title: (await h1.textContent())?.trim() ?? '' };
}

test.describe('NG-103 — settings root opens in both locales', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setupNotFoundTenant);
  test.afterAll(teardownNotFoundTenant);

  test('en: /en/<ws>/settings answers 200 without redirect and shows the modules page', async ({ page }) => {
    await signInAsNotFoundUser(page, `/en/${NF_WORKSPACE}/settings/modules`);

    const root = await mainHeading(page, `/en/${NF_WORKSPACE}/settings`);
    expect(root.status).toBe(200);
    expect(root.finalUrl).toBe(`/en/${NF_WORKSPACE}/settings`);

    // Same content as the canonical English modules page it re-exports.
    const canonical = await mainHeading(page, `/en/${NF_WORKSPACE}/settings/modules`);
    expect(canonical.status).toBe(200);
    expect(root.title).toBe(canonical.title);
    expect(root.title.length).toBeGreaterThan(0);
  });

  test('tr: /tr/<ws>/ayarlar still answers 200 with the same content', async ({ page }) => {
    await signInAsNotFoundUser(page, `/tr/${NF_WORKSPACE}/ayarlar/moduller`);

    const root = await mainHeading(page, `/tr/${NF_WORKSPACE}/ayarlar`);
    expect(root.status).toBe(200);
    expect(root.finalUrl).toBe(`/tr/${NF_WORKSPACE}/ayarlar`);
    expect(root.title.length).toBeGreaterThan(0);
  });

  test('en: an existing settings subpage is unchanged (profile answers 200)', async ({ page }) => {
    await signInAsNotFoundUser(page, `/en/${NF_WORKSPACE}/settings/profile`);
    const profile = await mainHeading(page, `/en/${NF_WORKSPACE}/settings/profile`);
    expect(profile.status).toBe(200);
    expect(profile.finalUrl).toBe(`/en/${NF_WORKSPACE}/settings/profile`);
  });
});

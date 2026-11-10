/**
 * NG-110 — the language switcher on the settings root must not drop the user on the profile page.
 *
 * Before: `switchLocalePath` mapped the bare `ayarlar` / `settings` segment to `settingsProfile`, so
 * clicking "English" on `/tr/<ws>/ayarlar` landed on `/en/<ws>/settings/profile` (and the other way round).
 * After: the root maps to the modules page it renders, in either direction.
 */
import { test, expect } from '@playwright/test';

import {
  NF_WORKSPACE,
  setupNotFoundTenant,
  signInAsNotFoundUser,
  teardownNotFoundTenant,
} from './fixtures/notfound-tenant';

test.describe('NG-110 — language switch on the settings root', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setupNotFoundTenant);
  test.afterAll(teardownNotFoundTenant);

  test('tr → en: clicking English keeps the user on the modules page', async ({ page }) => {
    await signInAsNotFoundUser(page, `/tr/${NF_WORKSPACE}/ayarlar/moduller`);
    await page.goto(`/tr/${NF_WORKSPACE}/ayarlar`);
    await page.getByRole('button', { name: /notFound E2E/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: /English/ }).filter({ visible: true }).click();

    await expect(page).toHaveURL(new RegExp(`/en/${NF_WORKSPACE}/settings/modules$`));
    console.log(`NG-110 tr→en target: ${new URL(page.url()).pathname}`);
    await expect(page.locator('main h1').first()).toBeVisible();
  });

  test('en → tr: clicking Türkçe keeps the user on the modules page', async ({ page }) => {
    await signInAsNotFoundUser(page, `/en/${NF_WORKSPACE}/settings/modules`);
    await page.goto(`/en/${NF_WORKSPACE}/settings`);
    await page.getByRole('button', { name: /notFound E2E/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: /Türkçe/ }).filter({ visible: true }).click();

    await expect(page).toHaveURL(new RegExp(`/tr/${NF_WORKSPACE}/ayarlar/moduller$`));
    console.log(`NG-110 en→tr target: ${new URL(page.url()).pathname}`);
    await expect(page.locator('main h1').first()).toBeVisible();
  });
});

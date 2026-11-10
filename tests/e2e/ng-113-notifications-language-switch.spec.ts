/**
 * NG-113 — the language switcher on the notifications page stays on the notifications page.
 *
 * `bildirimler` (TR) and `notifications` (EN) are one page. The catalog used to list both as
 * canonical; now `notifications` is canonical and `bildirimler` is an alias. The switch must keep
 * the user on the same page in either direction.
 */
import { test, expect } from '@playwright/test';

import {
  NF_WORKSPACE,
  setupNotFoundTenant,
  signInAsNotFoundUser,
  teardownNotFoundTenant,
} from './fixtures/notfound-tenant';

test.describe('NG-113 — language switch on the notifications page', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setupNotFoundTenant);
  test.afterAll(teardownNotFoundTenant);

  test('tr → en: clicking English keeps the user on the notifications page', async ({ page }) => {
    await signInAsNotFoundUser(page, `/tr/${NF_WORKSPACE}/bildirimler`);
    await page.goto(`/tr/${NF_WORKSPACE}/bildirimler`);
    await page.getByRole('button', { name: /notFound E2E/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: /English/ }).filter({ visible: true }).click();

    await expect(page).toHaveURL(new RegExp(`/en/${NF_WORKSPACE}/notifications$`));
    console.log(`NG-113 tr→en target: ${new URL(page.url()).pathname}`);
    await expect(page.locator('main h1').first()).toBeVisible();
  });

  test('en → tr: clicking Türkçe keeps the user on the notifications page', async ({ page }) => {
    await signInAsNotFoundUser(page, `/en/${NF_WORKSPACE}/notifications`);
    await page.goto(`/en/${NF_WORKSPACE}/notifications`);
    await page.getByRole('button', { name: /notFound E2E/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: /Türkçe/ }).filter({ visible: true }).click();

    await expect(page).toHaveURL(new RegExp(`/tr/${NF_WORKSPACE}/bildirimler$`));
    console.log(`NG-113 en→tr target: ${new URL(page.url()).pathname}`);
    await expect(page.locator('main h1').first()).toBeVisible();
  });
});

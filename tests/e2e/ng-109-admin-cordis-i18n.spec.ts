/**
 * NG-109 — the admin console is translated, and the Cordis screen shows the
 * sidebar and header in the language of the URL.
 *
 * Before this change the admin sidebar carried Turkish labels in the English
 * console (`locale === 'tr' ? … : …` and bare Turkish descriptions), and the
 * Cordis kicker read "INGESTİON" under Turkish casing. Both are checked on the
 * rendered page with real navigation, and each language is captured as a frame.
 */
import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

const SHOTS = shotsDir('NG-109-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  const value = await encode({
    token: {
      sub: 'demo-user-superadmin',
      id: 'demo-user-superadmin',
      name: 'Platform Admin',
      tenantId: 'demo-tenant',
      role: 'SUPER_ADMIN',
      isPlatformAdmin: true,
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' })
    );
  });
}

test.describe('NG-109 admin console language', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
  });

  test('Turkish console: sidebar labels and Cordis kicker are Turkish', async ({ page }) => {
    await page.goto('/tr/admin/cordis');
    const nav = page.locator('nav.space-y-1');
    await expect(nav).toContainText('Kiracı Hesapları');
    await expect(nav).toContainText('Kurum ve üye yönetimi');
    await expect(page.getByText('K2 CORDIS Veri Alımı ve M1 Partner İstihbarat Konsolu')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-cordis-tr.png`, fullPage: true });
  });

  test('English console: sidebar labels and Cordis kicker are English', async ({ page }) => {
    await page.goto('/en/admin/cordis');
    const nav = page.locator('nav.space-y-1');
    await expect(nav).toContainText('Tenant Accounts');
    await expect(nav).toContainText('Organisation and member management');
    await expect(nav).not.toContainText('Kiracı Hesapları');
    await expect(nav).not.toContainText('Kurum ve üye yönetimi');
    await expect(page.getByText('K2 CORDIS Ingestion & M1 Partner Intelligence Console')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-cordis-en.png`, fullPage: true });
  });
});

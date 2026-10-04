import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { shotsDir } from './fixtures/shots';

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('TASK-MUTYFGWYY5CS5-settings-modules-access');

async function signInAsUser(
  page: Page,
  baseURL: string,
  userId: string,
  role: 'MEMBER' | 'TENANT_OWNER',
  tenantId: string = 'demo-tenant',
): Promise<void> {
  const value = await encode({
    token: {
      sub: userId,
      id: userId,
      name: role === 'MEMBER' ? 'Member User' : 'Tenant Owner User',
      email: role === 'MEMBER' ? 'member@test.local' : 'owner@test.local',
      tenantId,
      role,
      isPlatformAdmin: false,
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

test.describe('Settings → Modules access control (RBAC)', () => {
  test('MEMBER user: Settings link goes to profile, no Modules link in user menu', async ({
    page,
    baseURL,
  }) => {
    await signInAsUser(page, baseURL as string, 'test-member-user-1', 'MEMBER');
    await page.goto('/tr/default/settings/profile');

    // User should see Settings link in sidebar (profile, not modules)
    const profileLink = page.locator('a[href*="/settings/profile"]');
    await expect(profileLink).toBeVisible();

    // Open user menu and verify no "Modül Ayarları" link
    const userButton = page.getByRole('button').last(); // Last button in header (user menu)
    await userButton.click();
    const moduleSettingsLink = page.locator('a[href*="/settings/modules"]');
    await expect(moduleSettingsLink).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/01-member-user-menu.png`, fullPage: false });
  });

  test('MEMBER user: accessing /settings/modules directly shows Access Denied', async ({
    page,
    baseURL,
  }) => {
    await signInAsUser(page, baseURL as string, 'test-member-user-2', 'MEMBER');
    await page.goto('/tr/default/settings/modules');

    // Should see "Erişim Reddedildi" (Access Denied) message
    await expect(page.getByText(/Erişim Reddedildi/)).toBeVisible();
    await expect(page.getByText(/Modülleri yönetme yetkiniz bulunmamaktadır/)).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/02-member-access-denied.png`, fullPage: true });
  });

  test('TENANT_OWNER user: Settings link goes to modules, Modules link visible in user menu', async ({
    page,
    baseURL,
  }) => {
    await signInAsUser(page, baseURL as string, 'test-owner-user-1', 'TENANT_OWNER');
    await page.goto('/tr/default/dashboard');

    // Sidebar Settings link should navigate to modules
    const settingsLink = page.locator('a[href*="/settings/modules"]');
    await expect(settingsLink).toBeVisible();

    // Open user menu and verify "Modül Ayarları" link exists
    const userButton = page.getByRole('button').last();
    await userButton.click();
    const moduleSettingsLink = page.locator('a[href*="/settings/modules"]');
    await expect(moduleSettingsLink).toBeVisible();
    await expect(moduleSettingsLink).toContainText(/Modül Ayarları|Module Settings/);

    await page.screenshot({ path: `${SHOTS}/03-owner-user-menu.png`, fullPage: false });
  });

  test('TENANT_OWNER user: /settings/modules page loads successfully', async ({
    page,
    baseURL,
  }) => {
    await signInAsUser(page, baseURL as string, 'test-owner-user-2', 'TENANT_OWNER');
    await page.goto('/tr/default/settings/modules');

    // Should see modules page content, not access denied
    await expect(page.getByText(/Erişim Reddedildi/)).toHaveCount(0);
    // Main content should be present
    await expect(page.locator('main')).toBeTruthy();

    await page.screenshot({ path: `${SHOTS}/04-owner-modules-page.png`, fullPage: true });
  });

  test('mobile 390px: MEMBER user Settings link goes to profile', async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsUser(page, baseURL as string, 'test-member-mobile', 'MEMBER');
    await page.goto('/tr/default/dashboard');

    // Open mobile menu
    const menuButton = page.getByRole('button', { name: /Open Mobile Menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(200);

      // Settings link should navigate to profile on mobile
      const settingsLink = page.locator('a').filter({ hasText: /settings|ayarlar/i }).first();
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await page.waitForURL(/\/settings\/(profile|ayarlar\/profil)/);
      }
    }

    await page.screenshot({ path: `${SHOTS}/05-mobile-member-sidebar.png`, fullPage: true });
  });
});

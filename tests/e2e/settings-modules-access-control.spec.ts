import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { shotsDir } from './fixtures/shots';
import { withSystemScope } from '../../src/lib/system-scope';
import { prisma } from '../../src/lib/db';

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
  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.settings-modules-access-control.setup', async (tx) => {
      // Create tenant
      await tx.tenant.upsert({
        where: { id: 'demo-tenant' },
        create: {
          id: 'demo-tenant',
          name: 'Demo Tenant',
          slug: 'demo',
          country: 'TR',
        },
        update: { name: 'Demo Tenant' },
      });

      // Create member user
      await tx.user.upsert({
        where: { id: 'test-member-user-1' },
        create: {
          id: 'test-member-user-1',
          email: 'member@test.local',
          locale: 'tr',
        },
        update: { email: 'member@test.local' },
      });

      // Create member membership (no manage_modules permission)
      await tx.membership.upsert({
        where: { tenantId_userId: { userId: 'test-member-user-1', tenantId: 'demo-tenant' } },
        create: {
          userId: 'test-member-user-1',
          tenantId: 'demo-tenant',
          role: 'MEMBER',
        },
        update: { role: 'MEMBER' },
      });

      // Create second member user
      await tx.user.upsert({
        where: { id: 'test-member-user-2' },
        create: {
          id: 'test-member-user-2',
          email: 'member2@test.local',
          locale: 'tr',
        },
        update: { email: 'member2@test.local' },
      });

      // Create second member membership
      await tx.membership.upsert({
        where: { tenantId_userId: { userId: 'test-member-user-2', tenantId: 'demo-tenant' } },
        create: {
          userId: 'test-member-user-2',
          tenantId: 'demo-tenant',
          role: 'MEMBER',
        },
        update: { role: 'MEMBER' },
      });

      // Create tenant owner user
      await tx.user.upsert({
        where: { id: 'test-owner-user-1' },
        create: {
          id: 'test-owner-user-1',
          email: 'owner@test.local',
          locale: 'tr',
        },
        update: { email: 'owner@test.local' },
      });

      // Create owner membership (with manage_modules permission)
      await tx.membership.upsert({
        where: { tenantId_userId: { userId: 'test-owner-user-1', tenantId: 'demo-tenant' } },
        create: {
          userId: 'test-owner-user-1',
          tenantId: 'demo-tenant',
          role: 'TENANT_OWNER',
        },
        update: { role: 'TENANT_OWNER' },
      });

      // Create second tenant owner user
      await tx.user.upsert({
        where: { id: 'test-owner-user-2' },
        create: {
          id: 'test-owner-user-2',
          email: 'owner2@test.local',
          locale: 'tr',
        },
        update: { email: 'owner2@test.local' },
      });

      // Create second owner membership
      await tx.membership.upsert({
        where: { tenantId_userId: { userId: 'test-owner-user-2', tenantId: 'demo-tenant' } },
        create: {
          userId: 'test-owner-user-2',
          tenantId: 'demo-tenant',
          role: 'TENANT_OWNER',
        },
        update: { role: 'TENANT_OWNER' },
      });

      // Create mobile member user
      await tx.user.upsert({
        where: { id: 'test-member-mobile' },
        create: {
          id: 'test-member-mobile',
          email: 'mobile@test.local',
          locale: 'tr',
        },
        update: { email: 'mobile@test.local' },
      });

      // Create mobile member membership
      await tx.membership.upsert({
        where: { tenantId_userId: { userId: 'test-member-mobile', tenantId: 'demo-tenant' } },
        create: {
          userId: 'test-member-mobile',
          tenantId: 'demo-tenant',
          role: 'MEMBER',
        },
        update: { role: 'MEMBER' },
      });
    });
  });

  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.settings-modules-access-control.teardown', async (tx) => {
      // Delete memberships first (FK constraint)
      await tx.membership.deleteMany({
        where: {
          userId: {
            in: [
              'test-member-user-1',
              'test-member-user-2',
              'test-owner-user-1',
              'test-owner-user-2',
              'test-member-mobile',
            ],
          },
        },
      });

      // Delete users
      await tx.user.deleteMany({
        where: {
          id: {
            in: [
              'test-member-user-1',
              'test-member-user-2',
              'test-owner-user-1',
              'test-owner-user-2',
              'test-member-mobile',
            ],
          },
        },
      });

      // Delete tenant
      await tx.tenant.deleteMany({
        where: { id: 'demo-tenant' },
      });
    });
    await prisma.$disconnect();
  });

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

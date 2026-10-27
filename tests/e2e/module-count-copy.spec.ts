import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { getModuleCounts } from '../../src/lib/modules/registry';

/**
 * FO-171 (TASK-MVQ6Y9J8Q3NSW, K-572973) — the module count the landing page and
 * the admin menu show is the registry's: "{active} aktif modül + {soon} yakında".
 * The landing page once said "11 Özel Ar-Ge Modülü (M1-M11)" and the admin badge
 * "11 Modül" while 17 manifests were registered.
 */

const SHOTS = shotsDir('FO-171-evidence');
const COOKIE_NAME = 'authjs.session-token';
const { active, soon } = getModuleCounts();

const ADMIN = {
  sub: 'demo-user-superadmin',
  id: 'demo-user-superadmin',
  name: 'Platform Admin',
  email: 'admin@yasinaslan.com.tr',
  tenantId: 'demo-tenant',
  role: 'SUPER_ADMIN',
  isPlatformAdmin: true,
};

const COPY = {
  tr: {
    summary: `${active} aktif modül + ${soon} yakında`,
    title: `AB Proje Yönetimi İçin ${active} Aktif Modül + ${soon} Yakında`,
    badge: `${active} aktif + ${soon} yakında`,
    catalog: 'Modül Kataloğu',
    adminLink: /Modül Yönetimi/,
  },
  en: {
    summary: `${active} live modules + ${soon} coming soon`,
    title: `${active} Live Modules for EU Proposal Production + ${soon} Coming Soon`,
    badge: `${active} live + ${soon} soon`,
    catalog: 'Module Catalog',
    adminLink: /Module State Manager/,
  },
} as const;

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

for (const locale of ['tr', 'en'] as const) {
  const copy = COPY[locale];

  test(`landing shows the registry module count (${locale})`, async ({ page }) => {
    await acceptCookies(page);
    await page.goto(`/${locale}`);
    await expect(page.getByText(copy.summary, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByText(/Ar-Ge Modül|R&D Module/)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/${locale}-landing-hero.png` });
    await page.getByRole('heading', { name: copy.title }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${SHOTS}/${locale}-landing-modules-title.png` });

    const catalog = page.getByTestId('public-footer').getByRole('link', { name: copy.catalog, exact: true });
    await expect(catalog).toBeVisible();
  });

  test(`admin menu badge shows the registry module count and still navigates (${locale})`, async ({
    page,
    baseURL,
  }) => {
    const value = await encode({ token: ADMIN, secret: e2eAuthSecret(), salt: COOKIE_NAME, maxAge: 60 * 60 });
    await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL as string }]);
    await acceptCookies(page);

    await page.goto(`/${locale}/admin/tenants`);
    const modulesLink = page.locator('aside').getByRole('link', { name: copy.adminLink });
    await expect(modulesLink).toContainText(copy.badge);
    await page.screenshot({ path: `${SHOTS}/${locale}-admin-sidebar.png` });

    await modulesLink.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/modules$`));
    await expect(page.locator('aside').getByRole('link', { name: copy.adminLink })).toContainText(copy.badge);
    await page.screenshot({ path: `${SHOTS}/${locale}-admin-modules.png` });

    // The mobile menu renders the same nav from the same server-side counts.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open Admin Menu' }).click();
    await expect(page.getByText(copy.badge, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/${locale}-admin-mobile-390.png` });
  });
}

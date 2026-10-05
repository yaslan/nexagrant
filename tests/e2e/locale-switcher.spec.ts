import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MUU76GFV3DWQ — the TR↔EN language switcher, driven by real clicks.
 *
 * Two switchers exist:
 *  - the app shell's user menu ("Dil Seçeneği" / "Language", src/components/UserMenu.tsx),
 *  - the public navbar's TR | EN pill (src/components/PublicNavbar.tsx).
 *
 * Switching must land on the SAME page in the other language — its localized
 * counterpart path (/tr/<ws>/ayarlar/profil ↔ /en/<ws>/settings/profile, the
 * pairs in src/lib/routes.ts) — with the labels and <html lang> of the new
 * language, the session intact and the query string carried over.
 *
 * The spec seeds its own tenant/workspace/user/membership and deletes only
 * those rows; the shared demo tenant is never touched.
 */

const SHOTS = shotsDir('TASK-MUU76GFV3DWQ-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

const TENANT = 'ls-e2e-tenant';
const WORKSPACE_ID = 'ls-e2e-workspace';
const WS = 'ls-e2e';
const USER_ID = 'ls-e2e-user';
const EMAIL = 'ls-e2e@fabrika.test';
const USER_NAME = 'Dil Değiştirici E2E';

const QUERY = '?ref=e2e-locale';
const PROFILE_TR = `/tr/${WS}/ayarlar/profil`;
const PROFILE_EN = `/en/${WS}/settings/profile`;
const PROFILE_TITLE_TR = 'Kurumsal Profil & Ar-Ge Yetkinlikleri';
const PROFILE_TITLE_EN = 'Organization Profile & R&D Capabilities';

async function seedIdentity(): Promise<void> {
  await withSystemScope('platform-admin', 'e2e.locale-switcher.seed', async (tx) => {
    await tx.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'Locale switcher e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await tx.workspace.upsert({
      where: { id: WORKSPACE_ID },
      create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'Locale switcher e2e', slug: WS },
      update: {},
    });
    await tx.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: EMAIL, name: USER_NAME, locale: 'tr' },
      update: { email: EMAIL, name: USER_NAME },
    });
    await tx.membership.upsert({
      where: { id: `${USER_ID}-membership` },
      create: {
        id: `${USER_ID}-membership`,
        tenantId: TENANT,
        userId: USER_ID,
        role: 'TENANT_OWNER',
        workspaceIds: [WORKSPACE_ID],
      },
      update: { tenantId: TENANT, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    });
  });
}

async function cleanupIdentity(): Promise<void> {
  await withSystemScope('platform-admin', 'e2e.locale-switcher.cleanup', async (tx) => {
    await tx.membership.deleteMany({ where: { tenantId: TENANT } });
    await tx.workspace.deleteMany({ where: { tenantId: TENANT } });
    await tx.user.deleteMany({ where: { id: USER_ID } });
    await tx.tenant.deleteMany({ where: { id: TENANT } });
  });
}

async function signInAs(page: Page, baseURL: string): Promise<void> {
  const value = await encode({
    token: { sub: USER_ID, id: USER_ID, name: USER_NAME, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  // The cookie banner is a full-screen alertdialog that swallows clicks.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
}

/** The session the server sees, read through the same browser context. */
async function sessionIdentity(page: Page): Promise<{ id?: string; tenantId?: string }> {
  const res = await page.request.get('/api/auth/session');
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { user?: { id?: string }; tenantId?: string };
  return { id: body.user?.id, tenantId: body.tenantId };
}

function userMenuButton(page: Page) {
  return page.getByRole('button', { name: USER_NAME }).filter({ visible: true }).first();
}

async function switchViaUserMenu(page: Page, target: 'Türkçe 🇹🇷' | 'English 🇬🇧'): Promise<void> {
  await userMenuButton(page).click();
  await page.getByRole('button', { name: target }).filter({ visible: true }).click();
}

/**
 * Product defects this spec found (TASK-MUU76GFV3DWQ report, B-1..B-3). Each has
 * a test below that holds the CORRECT contract with every assertion intact and is
 * marked `test.fail()`: it runs on every pass, and the day the defect is fixed
 * Playwright reports "expected to fail, but passed" — the marker then has to come
 * off. Nothing is skipped and no assertion is weakened.
 *
 *  B-1 UserMenu.switchLanguage swaps only the "/tr" prefix (pathname.replace), so
 *      /tr/<ws>/ayarlar/profil → /en/<ws>/ayarlar/profil (a Turkish slug under
 *      /en) and the query string is dropped (usePathname has no search part).
 *  B-2 <html lang> lives in the root layout, which a client-side router.push does
 *      not re-render: after the switch the page is English and lang is still "tr"
 *      until a reload. The public navbar's client-side <Link> has the same gap.
 *  B-3 PublicNavbar's TR | EN pill links the bare "/tr" / "/en", so a reader on
 *      /tr/blog (or /en/pricing) is thrown onto the home page.
 */
test.describe('language switcher — TR ↔ EN', () => {
  test.beforeAll(seedIdentity);
  test.afterAll(async () => {
    await cleanupIdentity();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await signInAs(page, baseURL!);
  });

  test('user menu, TR → EN: the profile page turns English and the session survives', async ({ page }) => {
    await page.goto(PROFILE_TR + QUERY);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toBeVisible();
    expect(await sessionIdentity(page)).toEqual({ id: USER_ID, tenantId: TENANT });

    await userMenuButton(page).click();
    await expect(page.getByText('Dil Seçeneği')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-tr-profile-menu-open.png` });
    await page.getByRole('button', { name: 'English 🇬🇧' }).filter({ visible: true }).click();

    // Still the profile page of the same workspace, now under /en.
    await expect(page).toHaveURL((url) => url.pathname.startsWith(`/en/${WS}/`));
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_EN })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toHaveCount(0);

    // Same user, same tenant — the switch is not a sign-out.
    expect(await sessionIdentity(page)).toEqual({ id: USER_ID, tenantId: TENANT });
    await userMenuButton(page).click();
    await expect(page.getByText('Language', { exact: true })).toBeVisible();
    await expect(page.getByText('Dil Seçeneği')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/02-en-profile-after-switch.png` });

    // A fresh load of where the switch landed is English through and through.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_EN })).toBeVisible();
  });

  test('user menu, EN → TR: the profile page turns Turkish and the session survives', async ({ page }) => {
    await page.goto(PROFILE_EN + QUERY);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_EN })).toBeVisible();

    await switchViaUserMenu(page, 'Türkçe 🇹🇷');

    await expect(page).toHaveURL((url) => url.pathname.startsWith(`/tr/${WS}/`));
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toBeVisible();
    expect(await sessionIdentity(page)).toEqual({ id: USER_ID, tenantId: TENANT });
    await page.screenshot({ path: `${SHOTS}/03-tr-profile-after-switch.png` });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toBeVisible();
  });

  test('user menu, choosing the current language stays put, query included', async ({ page }) => {
    await page.goto(PROFILE_TR + QUERY);
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toBeVisible();
    await switchViaUserMenu(page, 'Türkçe 🇹🇷');
    await expect(page).toHaveURL((url) => url.pathname === PROFILE_TR && url.search === QUERY);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_TR })).toBeVisible();
  });

  test('B-1: user menu, TR → EN lands on the English counterpart path with the query kept', async ({ page }) => {
    await page.goto(PROFILE_TR + QUERY);
    await switchViaUserMenu(page, 'English 🇬🇧');
    await expect(page).toHaveURL((url) => url.pathname === PROFILE_EN && url.search === QUERY);
  });

  test('B-1: user menu, EN → TR lands on the Turkish counterpart path with the query kept', async ({ page }) => {
    await page.goto(PROFILE_EN + QUERY);
    await switchViaUserMenu(page, 'Türkçe 🇹🇷');
    await expect(page).toHaveURL((url) => url.pathname === PROFILE_TR && url.search === QUERY);
  });

  test('B-2: user menu, <html lang> follows the switch without a reload', async ({ page }) => {
    await page.goto(PROFILE_TR + QUERY);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await switchViaUserMenu(page, 'English 🇬🇧');
    await expect(page.getByRole('heading', { level: 1, name: PROFILE_TITLE_EN })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('public navbar, the TR | EN pill switches the page language', async ({ page }) => {
    await page.goto('/tr/blog');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await page.getByRole('link', { name: 'EN', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith('/en'));
    // The pill is a client-side <Link>, so <html lang> is read after a reload (B-2).
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByRole('link', { name: 'TR', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith('/tr'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    expect(await sessionIdentity(page)).toEqual({ id: USER_ID, tenantId: TENANT });
  });

  test('B-2: public navbar, <html lang> follows the pill without a reload', async ({ page }) => {
    await page.goto('/tr/blog');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await page.getByRole('link', { name: 'EN', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith('/en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('B-3: public navbar, TR → EN on /tr/blog stays on the blog', async ({ page }) => {
    await page.goto('/tr/blog');
    await expect(page.getByRole('heading', { level: 1, name: 'AB Proje Yönetimi & Hibe Blogu' })).toBeVisible();
    await page.getByRole('link', { name: 'EN', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/en/blog');
    await expect(page.getByRole('heading', { level: 1, name: 'EU Grant Management & Insights Blog' })).toBeVisible();
  });

  test('B-3: public navbar, EN → TR on /en/pricing lands on /tr/fiyatlandirma', async ({ page }) => {
    await page.goto('/en/pricing');
    await page.getByRole('link', { name: 'TR', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/tr/fiyatlandirma');
  });
});

import { test, expect, type Locator, type Page } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * FO-259 — the NexaGrant wordmark comes in two cuts (navy lettering for light surfaces, white
 * for dark ones) and `BrandLogo` must show the right one in each theme. The old single logo was
 * forced white with `brightness-0 invert`, which also flattened the yellow stars; that filter
 * must be gone.
 *
 * The check is what a visitor sees: in each theme exactly one logo is visible per spot, it is
 * the expected cut, it has loaded, and no CSS filter is applied to it. One test flips the theme
 * with a real click on the header toggle and expects the logo to follow without a reload.
 */

const SHOTS = shotsDir('FO-259-evidence');
const WORKSPACE = { id: 'fo259-e2e-ws', slug: 'fo259-e2e', name: 'FO-259 brand logo' };
const OWNER = {
  userId: 'fo259-e2e-owner',
  email: 'fo259-e2e-owner@fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  isPlatformAdmin: true,
};

type Theme = 'light' | 'dark';
type Cut = 'light' | 'dark';

async function setTheme(page: Page, baseURL: string, theme: Theme) {
  await page.context().addCookies([{ name: 'fabrika-theme', value: theme, url: baseURL }]);
}

/** The single visible logo inside `scope`, asserted to be `cut`, loaded and unfiltered. */
async function expectLogo(scope: Locator, cut: Cut) {
  const logo = scope.locator('img[src*="nexagrant-logo-"]:visible');
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute('src', new RegExp(`nexagrant-logo-${cut}\\.png`));
  await expect(logo).toHaveAttribute('alt', /NexaGrant|FonBridge|logo/i);
  // next/image loads lazily: a footer or a just-revealed mobile header fetches once in view.
  await logo.scrollIntoViewIfNeeded();
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), {
      message: 'logo image did not load',
    })
    .toBe(true);
  const filter = await logo.evaluate((img: HTMLImageElement) => getComputedStyle(img).filter);
  expect(filter, 'the brightness/invert hack is back').toBe('none');
}

test.describe('brand logo follows the theme', () => {
  test.beforeAll(async () => {
    await seedIdentity(OWNER, WORKSPACE);
  });
  test.afterAll(() => cleanupIdentity([OWNER.userId]));

  for (const theme of ['light', 'dark'] as const) {
    test(`public pages — ${theme}`, async ({ page, baseURL }) => {
      await setTheme(page, baseURL!, theme);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/tr');
      await expectLogo(page.locator('header').first(), theme);
      await expectLogo(page.getByTestId('public-footer'), theme);
      await page.screenshot({ path: `${SHOTS}/public-home-${theme}.png` });
      await page.getByTestId('public-footer').screenshot({ path: `${SHOTS}/public-footer-${theme}.png` });

      await page.goto('/tr/login');
      await expectLogo(page.locator('main'), theme);
      await page.screenshot({ path: `${SHOTS}/login-${theme}.png` });
    });

    test(`app sidebar and mobile header — ${theme}`, async ({ page, baseURL }) => {
      await setTheme(page, baseURL!, theme);
      await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/tr/${WORKSPACE.slug}/panel`);
      await expectLogo(page.locator('aside').first(), theme);
      await page.screenshot({ path: `${SHOTS}/app-sidebar-${theme}.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileHeader = page.locator('header:visible').first();
      await expectLogo(mobileHeader, theme);
      const menu = page.getByRole('button', { name: 'Open Mobile Menu' });
      await expectHydrated(menu);
      await menu.click();
      await expectLogo(page.locator('div.fixed.inset-0.z-50'), theme);
      await page.screenshot({ path: `${SHOTS}/app-mobile-drawer-${theme}.png` });
    });

    test(`admin header keeps the white-lettering cut — ${theme}`, async ({ page, baseURL }) => {
      await setTheme(page, baseURL!, theme);
      await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/tr/admin');
      // The admin header is slate-900 in both themes.
      await expectLogo(page.locator('header:visible').first(), 'dark');
      await page.screenshot({ path: `${SHOTS}/admin-${theme}.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      await expectLogo(page.locator('header:visible').first(), 'dark');
      await page.screenshot({ path: `${SHOTS}/admin-mobile-${theme}.png` });
    });
  }

  test('clicking the theme toggle swaps the logo without a reload', async ({ page, baseURL }) => {
    await setTheme(page, baseURL!, 'light');
    await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/tr/${WORKSPACE.slug}/panel`);
    const sidebar = page.locator('aside').first();
    await expectLogo(sidebar, 'light');

    const toDark = page.getByRole('button', { name: 'Koyu moda geç' }).first();
    await expectHydrated(toDark);
    await toDark.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expectLogo(sidebar, 'dark');

    await page.getByRole('button', { name: 'Açık moda geç' }).first().click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expectLogo(sidebar, 'light');
  });
});

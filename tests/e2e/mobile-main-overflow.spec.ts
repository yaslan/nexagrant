import { test, expect, type Browser } from '@playwright/test';

import { prisma } from '../../src/lib/db';

/**
 * TASK-MUNZ06XM2OIL2 — nothing inside the shell's <main> may be wider than
 * <main> itself on a phone.
 *
 * <main> is a scroll box (overflow-auto), so a too-wide child never shows up
 * as a document-level scrollbar: `documentElement.scrollWidth` stays equal to
 * the viewport and the page only slides sideways under a finger. The 2px edge
 * work (TASK-MUNU027UKJ2AD) was checked at document level and so missed these
 * seven routes (İNCELEME-72 Y-1). This spec reads the box that actually
 * scrolls.
 *
 * The widths are the ones the mobile edge rule was measured at, plus 640 (sm;
 * the sidebar only appears at md). The first seven routes
 * were over at 320px before the fix; evaluations was still over at 472px.
 */

const ADMIN_EMAIL = 'admin@yasinaslan.com.tr';
const WIDTHS = [320, 360, 390, 472, 640];
const ROUTES = [
  '/tr/fabrika-beta/opportunities/demo-opp-1/evaluations',
  '/tr/admin/cordis',
  '/tr/admin/alerts',
  '/tr/fabrika-beta/approvals',
  '/tr/fabrika-beta/onay-merkezi',
  '/tr/fabrika-beta/ayarlar/kapilar',
  '/tr/fabrika-beta/settings/gates',
  // Over by 4px at 640 only (the header's action row would not let the title shrink).
  '/tr/fabrika-beta/firsatlar/demo-opp-1',
];

let storageState: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;
let skipReason = '';

async function signIn(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  await page.goto('/tr/giris?callbackUrl=%2Ftr%2Fadmin%2Falerts');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/tr/admin/alerts', { timeout: 30_000 });
  storageState = await ctx.storageState();
  await ctx.close();
}

test.describe.configure({ mode: 'serial' });

test.describe('no sideways scroll inside <main> on a phone', () => {
  test.beforeAll(async ({ browser }) => {
    if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
      skipReason = `no platform admin ${ADMIN_EMAIL} in this database (run pnpm db:seed)`;
    } else {
      await signIn(browser);
    }
    await prisma.$disconnect();
  });

  for (const route of ROUTES) {
    test(route, async ({ browser }) => {
      test.skip(skipReason !== '', skipReason);
      const ctx = await browser.newContext({ storageState, viewport: { width: 320, height: 800 } });
      const page = await ctx.newPage();
      const response = await page.goto(route);
      expect(response?.status(), `${route} must render, not redirect to a lock or 404`).toBe(200);
      const main = page.locator('main');
      // An empty <main> is trivially 0 wide; measure only once the page's own
      // content (every one of these routes has a heading) is on screen.
      await expect(main.locator('h1, h2').first()).toBeVisible({ timeout: 30_000 });

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(200);
        const over = await main.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(over, `${route} at ${width}px: <main>.scrollWidth − clientWidth`).toBe(0);
      }
      await ctx.close();
    });
  }
});

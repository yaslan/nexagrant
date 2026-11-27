import { test, expect, type Browser, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import trMessages from '../../messages/tr.json';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import {
  fitsHorizontally,
  isBelow,
  longContentFixture,
  mainOverflow,
  plant,
  PLANTED_ROWS,
  remove,
  stretchTexts,
} from './fixtures/mobile-long-content';

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
/**
 * The db:seed admin seat itself (prisma/seed-tenant-workspace.ts DEMO_ADMIN_SEAT), not a
 * seat of this spec's own: fixtures/mobile-long-content.ts plants "my" approval requests
 * under `demo-user-superadmin`, so only that user sees them as its own. It is signed in
 * with a minted cookie instead of the demo form, so the spec runs against `next start`
 * too (TASK-MUSBCXP9RKS3D); it is never seeded or deleted here — it is the seed's row.
 */
const ADMIN_SEAT = {
  id: 'demo-user-superadmin',
  email: ADMIN_EMAIL,
  tenantId: 'demo-tenant',
  role: 'TENANT_OWNER',
};
const WIDTHS = [320, 360, 390, 472, 640];
// `main` is the seed's workspace (prisma/seed-tenant-workspace.ts). These routes used
// `fabrika-beta` — the tenant's slug — which the [workspace] guard answers 404.
const ROUTES = [
  '/tr/main/opportunities/demo-opp-1/evaluations',
  '/tr/admin/cordis',
  '/tr/admin/alerts',
  '/tr/main/approvals',
  '/tr/main/onay-merkezi',
  '/tr/main/ayarlar/kapilar',
  '/tr/main/settings/gates',
  // Over by 4px at 640 only (the header's action row would not let the title shrink).
  '/tr/main/firsatlar/demo-opp-1',
];

let storageState: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;
let skipReason = '';

async function signIn(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInAs(page, ADMIN_SEAT);
  // After signInAs, whose own consent script records analytics/marketing as accepted:
  // init scripts run in order, so this one decides what the stored state holds.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
  // Visiting an admin page is the proof the cookie is a platform admin's, and it is
  // what puts the consent into localStorage for `storageState` to carry.
  await page.goto('/tr/admin/alerts');
  await page.waitForURL('**/tr/admin/alerts', { timeout: 30_000 });
  storageState = await ctx.storageState();
  await ctx.close();
}

test.describe.configure({ mode: 'serial' });

// TASK-MUOAYGYXW8PHI: the seed has only short text, so the routes above stayed
// green while a link pasted into an approval request or an opportunity title
// still pushed <main> sideways (İNCELEME-96 Y-1/Y-2). The file plants that
// content once and the second describe reads it.
const LONG = longContentFixture(Date.now().toString(36));
let planted = false;

test.beforeAll(async ({ browser }) => {
  if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
    skipReason = `no platform admin ${ADMIN_EMAIL} in this database (run pnpm db:seed)`;
    return;
  }
  await plant(LONG);
  planted = true;
  await signIn(browser);
});

test.afterAll(async () => {
  if (planted) expect(await remove(LONG), 'every planted row must be removed').toBe(PLANTED_ROWS);
  await prisma.$disconnect();
});

test.describe('no sideways scroll inside <main> on a phone', () => {
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
        const over = await mainOverflow(page);
        expect(over, `${route} at ${width}px: <main>.scrollWidth − clientWidth`).toBe(0);
      }
      await ctx.close();
    });
  }
});

// Phones plus the tablet and desktop widths: the approvals action row was
// also over at 768 (İNCELEME-96 Y-1), and the long title is where the
// opportunity header's min-w-0 does its work (640 and up).
const LONG_WIDTHS = [...WIDTHS, 768, 1024, 1280];

async function openAt(browser: Browser, route: string, width: number) {
  const ctx = await browser.newContext({ storageState, viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const response = await page.goto(route);
  expect(response?.status(), `${route} must render, not redirect to a lock or 404`).toBe(200);
  return { ctx, page };
}

async function expectNoOverflowAcross(page: Page, label: string) {
  for (const width of LONG_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(200);
    expect(await mainOverflow(page), `${label} at ${width}px: <main>.scrollWidth − clientWidth`).toBe(0);
  }
}

test.describe('long real-world content stays inside <main>', () => {
  test('approvals: a link pasted into the title and description', async ({ browser }) => {
    test.skip(skipReason !== '', skipReason);
    const { ctx, page } = await openAt(browser, '/tr/main/approvals', 320);
    const main = page.locator('main');

    // Default tab: someone else's request, with the approve/reject buttons and
    // the requester's e-mail (no name) under it.
    await expect(main.getByRole('heading', { name: LONG.requestTitle })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(LONG.requesterEmail)).toBeVisible();
    await expectNoOverflowAcross(page, 'approvals / actionable');

    // "My requests": the request this admin raised, with the withdraw button.
    await page.setViewportSize({ width: 320, height: 800 });
    const mine = main.getByRole('button', { name: /Taleplerim/ });
    await expectHydrated(mine);
    await mine.click();
    await expect(main.getByRole('heading', { name: LONG.requestTitle })).toHaveCount(1);
    // …and the rejected one, whose reason is a single unbroken word.
    await expect(main.getByText(LONG.rejectionReason)).toBeVisible();
    await expectNoOverflowAcross(page, 'approvals / my requests');

    // Detail modal at the narrowest width: the long title must not push the
    // close button off the screen. The pending request's own card, not
    // whichever card the list happens to sort first.
    await page.setViewportSize({ width: 320, height: 800 });
    await main
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: LONG.requestTitle }) })
      .filter({ has: page.getByRole('button', { name: /Detay/ }) })
      .last()
      .getByRole('button', { name: /Detay/ })
      .click();
    const close = page.getByRole('button', { name: '×' });
    await expect(close).toBeVisible();
    const box = await close.boundingBox();
    expect(box && box.x + box.width, 'detail modal × at 320px: right edge').toBeLessThanOrEqual(320);
    // …and the title wraps inside its own box instead of running under the ×.
    const modalTitle = page.getByRole('heading', { name: LONG.requestTitle }).last();
    expect(await modalTitle.evaluate((el) => el.scrollWidth - el.clientWidth), 'detail modal title at 320px').toBe(0);
    await ctx.close();
  });

  test('opportunity detail: a link pasted into the title', async ({ browser }) => {
    test.skip(skipReason !== '', skipReason);
    const { ctx, page } = await openAt(browser, `/tr/main/firsatlar/${LONG.opportunityId}`, 320);
    const title = page.locator('main h1', { hasText: LONG.opportunityTitle });
    await expect(title).toBeVisible({ timeout: 30_000 });
    await expectNoOverflowAcross(page, 'opportunity detail');

    // A title too long for one line puts the actions under it between sm and
    // lg (sm:flex-wrap), and beside it from lg on (lg:flex-nowrap). Without the
    // wrap the actions keep their width and squeeze the title into a sliver.
    const heading = title.locator('..');
    const actions = page.getByTestId('pipeline-evaluate-gate').locator('..');
    for (const [width, below] of [[640, true], [768, true], [1024, false], [1280, false]] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      expect(await isBelow(actions, heading), `opportunity actions at ${width}px below the title`).toBe(below);
    }

    // "Arşivle" asks first, in a band that repeats the title (İNCELEME-109 Y-1).
    // Opening it archives nothing; only its confirm button would.
    await page.setViewportSize({ width: 320, height: 800 });
    const archive = page.getByTestId('pipeline-archive');
    await expectHydrated(archive);
    await archive.click();
    const band = page.getByTestId('pipeline-archive-confirm');
    await expect(band).toBeVisible();
    await expectNoOverflowAcross(page, 'opportunity archive confirmation');
    // <main> can stay level while the text runs out of the amber box (390px).
    for (const width of LONG_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      expect(await band.evaluate((el) => el.scrollWidth - el.clientWidth), `archive band at ${width}px`).toBe(0);
    }
    await ctx.close();
  });

  test('gate settings: a longer weight name than today’s', async ({ browser }) => {
    test.skip(skipReason !== '', skipReason);
    const { ctx, page } = await openAt(browser, '/tr/main/settings/gates', 320);
    // Hydrated first: hydration would put the original text back. The page is
    // read-only since AKTAR-MURBCJ0A-1, so there is no submit button to wait on.
    await expectHydrated(page.getByTestId('weight-alignment'));
    // The names are catalogue strings, so there is no row to plant: stretch them
    // in place. 42 more characters with no break opportunity.
    const names = Object.values(trMessages.settings.gates.weights);
    const suffix = 'AcrossEveryConsortiumPartnerAndWorkPackage';
    const stretched = await stretchTexts(page, names, suffix);
    expect(stretched, 'every weight name was found and stretched').toBe(names.length);
    await expectNoOverflowAcross(page, 'gate settings');
    await expect(page.locator('main span', { hasText: suffix }), 'the stretched names are still on the page').toHaveCount(names.length);
    await ctx.close();
  });

  test('cordis tabs: every tab reached with the keyboard is fully visible', async ({ browser }) => {
    test.skip(skipReason !== '', skipReason);
    const { ctx, page } = await openAt(browser, '/tr/admin/cordis', 320);
    const first = page.getByRole('button', { name: /K2 Ingestion/ });
    await expectHydrated(first);
    const strip = first.locator('..');
    const tabs = strip.getByRole('button');
    const count = await tabs.count();
    expect(count, 'the strip holds the four tabs').toBe(4);

    // Chrome does not scroll a half-visible element into view on Tab; the
    // strip's onFocus does. Real key presses, not focus() calls.
    await first.focus();
    for (let i = 0; i < count; i++) {
      if (i > 0) await page.keyboard.press('Tab');
      const tab = tabs.nth(i);
      await expect(tab).toBeFocused();
      await page.waitForTimeout(100);
      expect(await fitsHorizontally(tab, strip), `cordis tab ${i + 1} fully inside the strip at 320px`).toBe(true);
    }
    await ctx.close();
  });
});

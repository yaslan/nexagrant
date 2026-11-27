import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { F10, seed, rollback } from '../../scripts/seed-f10-e2e';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTQWBAJ2T5XSV (F10+F16) — "absence is not zero", in a real browser.
 *
 * Three states the product used to collapse into one:
 *   • a workspace with no opportunities            → an explanation, not "0,0 %"
 *   • a workspace whose figures really are zero    → "0,0 %", stated plainly
 *   • an evaluation nobody has scored              → "not evaluated", not "0.0 / 15.0"
 *
 * The last one is the reason the second is asserted at all: the cheap fix for the first
 * two is to suppress zeros everywhere, which would hide a real result.
 */

const SHOTS = shotsDir('TASK-MTQWBAJ2T5XSV-screenshots');

const dashboardUrl = (workspace: string, locale = 'tr') =>
  locale === 'tr' ? `/${locale}/${workspace}/panel` : `/${locale}/${workspace}/dashboard`;

const evaluationsUrl = (workspace: string, opportunityId: string, locale = 'tr') =>
  `/${locale}/${workspace}/opportunities/${opportunityId}/evaluations`;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

/**
 * A network-idle wait used to close this helper and timed the suite out
 * whenever the machine was busy: "no requests for 500 ms" never comes true on a dev server
 * under load, so it is a race rather than a signal. Every caller asserts on a locator
 * straight afterwards, and Playwright's auto-waiting is the synchronisation.
 */
async function signIn(page: Page, email: string, target: string) {
  // A cookie for the user the seed wrote: the demo sign-in form does not exist in a
  // production build (TASK-MUSBCXP9RKS3D). The locale lives in `target` itself.
  const seat = [F10.empty, F10.full].find((t) => t.email === email);
  if (!seat) throw new Error(`no seeded F10 user for ${email}`);
  await signInAs(page, { id: seat.userId, email: seat.email, tenantId: seat.tenantId, role: 'TENANT_OWNER' });
  await page.goto(target);
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.describe('F10 — a workspace with nothing in it is not a workspace scoring zero', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    // F10_E2E_KEEP=1 leaves the fixture behind for inspection;
    // `pnpm tsx scripts/seed-f10-e2e.ts --rollback` clears it.
    if (process.env.F10_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('an empty workspace explains itself instead of reporting a 0 % hit rate', async ({ page }) => {
    await acceptCookies(page);
    const target = dashboardUrl(F10.empty.workspaceSlug);
    await signIn(page, F10.empty.email, target);

    const overview = page.locator('#dashboard-panel-overview');
    await expect(overview).toBeVisible();

    await expect(overview).toContainText('Bu çalışma alanında henüz fırsat yok');
    // The whole point: no invented figure anywhere in the panel.
    await expect(overview).not.toContainText('0,0');
    await expect(overview).not.toContainText('İsabet Oranı');

    // …and the empty state points at the one action that starts producing the numbers.
    const cta = overview.getByRole('link', { name: 'Fırsatlara git' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', `/tr/${F10.empty.workspaceSlug}/firsatlar`);

    await shot(page, '01-empty-tenant-dashboard-tr');
  });

  test('the same empty state reads in English', async ({ page }) => {
    await acceptCookies(page);
    const target = dashboardUrl(F10.empty.workspaceSlug, 'en');
    await signIn(page, F10.empty.email, target);

    const overview = page.locator('#dashboard-panel-overview');
    await expect(overview).toContainText('No opportunities in this workspace yet');
    await expect(overview).toContainText('Go to opportunities');
    await expect(overview).not.toContainText('0.0');

    await shot(page, '02-empty-tenant-dashboard-en');
  });

  test('a populated workspace shows its real figures — including a hit rate that is really 0', async ({
    page,
  }) => {
    await acceptCookies(page);
    const target = dashboardUrl(F10.full.workspaceSlug);
    await signIn(page, F10.full.email, target);

    const overview = page.locator('#dashboard-panel-overview');
    await expect(overview).toBeVisible();
    await expect(overview).not.toContainText('Bu çalışma alanında henüz fırsat yok');

    // Two opportunities cleared G0 and neither was submitted. That is a measurement,
    // and suppressing it would be the opposite mistake to the one being fixed.
    const hitRate = overview.locator('div', { hasText: /^İsabet Oranı$/ }).first();
    await expect(overview).toContainText('İsabet Oranı');
    await expect(overview).toContainText('0,0');
    await expect(hitRate).toBeVisible();

    // 40 logged hours over 1 proposal = 5.0 person-days/proposal; G0→G2 spans 10 days.
    await expect(overview).toContainText('5,0');
    await expect(overview).toContainText('10,0');
    // 4 + 4 + 3 over three criteria = 3.67, from the one completed reader. The two
    // unscored rows must not drag it toward zero.
    await expect(overview).toContainText('3,7');

    await shot(page, '03-populated-tenant-real-numbers-tr');
  });

  test('a date range with no opportunities says that, not that the workspace is empty', async ({
    page,
  }) => {
    await acceptCookies(page);
    const target = dashboardUrl(F10.full.workspaceSlug);
    await signIn(page, F10.full.email, target);

    // A window entirely before the fixture was created.
    await page.goto(`${target}?from=2020-01-01&to=2020-02-01`);

    const overview = page.locator('#dashboard-panel-overview');
    await expect(overview).toContainText('Seçili tarih aralığında fırsat yok');
    await expect(overview).not.toContainText('Bu çalışma alanında henüz fırsat yok');

    await shot(page, '04-empty-date-range-tr');
  });

  test('an unfilled evaluation reads "not evaluated", never "0.0 / 15.0 below threshold"', async ({
    page,
  }) => {
    await acceptCookies(page);
    const target = evaluationsUrl(F10.full.workspaceSlug, F10.full.opportunityA);
    await signIn(page, F10.full.email, target);

    const main = page.getByRole('main');

    // The scored reader still shows its total and verdict.
    await expect(main).toContainText('Toplam: 11.0 / 15.0');

    // The draft and the panel row say why they have no score…
    await expect(main.getByText('Henüz değerlendirilmedi')).toHaveCount(2);
    // …and no unscored row is given a threshold verdict.
    await expect(main).not.toContainText('Toplam: 0.0 / 15.0');

    // The header average is the scored reader alone, not (11 + 0 + 0) / 3.
    await expect(main).toContainText('11.0');
    await expect(main).not.toContainText('3.7 ');

    await shot(page, '05-unscored-evaluation-not-evaluated-tr');

    // The contrast in one frame: one scored reader with a total and a verdict, two
    // unscored records each saying why they have none.
    const feed = main.locator('div[class*="col-span-7"]').first();
    await expect(feed).toBeVisible();
    await feed.screenshot({ path: `${SHOTS}/06-evaluation-feed-scored-vs-unscored-tr.png` });
  });
});

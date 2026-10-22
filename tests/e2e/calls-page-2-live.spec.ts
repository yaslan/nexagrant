import { test, expect, type Page } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * FO-42 — page 2 of the calls list shows different calls than page 1, in a real browser against
 * the real `/api/cagrilar` route and the live SEDIA portal (nothing is stubbed).
 *
 * It needs the network, so it only runs when E2E_LIVE_SEDIA=1; the pre-push gate must not depend
 * on a third-party portal being up.
 *
 *   E2E_LIVE_SEDIA=1 E2E_PORT=3142 E2E_DATABASE_URL=<isolated copy> \
 *     E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/calls-page-2-live.spec.ts
 */

const SHOTS = shotsDir('TASK-MVC67YYIUXGAH-evidence');
const SEAT = { id: 'demo-user-superadmin', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CALLS_URL = '/en/main/calls';

type CallsBody = { success: boolean; totalResults: number; pageNumber: number; topics: Array<{ identifier: string }> };

/** Clicks `trigger` and returns the JSON of the `/api/cagrilar` answer for `page`. */
async function answerFor(page: Page, pageNo: number, trigger: () => Promise<void>): Promise<CallsBody> {
  const answered = page.waitForResponse(
    (r) => r.url().includes('/api/cagrilar?') && new URL(r.url()).searchParams.get('page') === String(pageNo),
    { timeout: 240_000 },
  );
  await trigger();
  const res = await answered;
  expect(res.status()).toBe(200);
  return (await res.json()) as CallsBody;
}

const rowTitles = (page: Page) => page.locator('tbody tr td:nth-child(2)').allInnerTexts();

test.describe('calls page — page 2 (live SEDIA)', () => {
  test.skip(!process.env.E2E_LIVE_SEDIA, 'set E2E_LIVE_SEDIA=1 to run against the live SEDIA portal');
  test.setTimeout(600_000);

  test('"Next" shows other calls than page 1, none repeated, and "Previous" brings page 1 back', async ({ page }) => {
    await signInAs(page, SEAT);
    const first = answerFor(page, 1, async () => {
      await page.goto(`${CALLS_URL}`);
    });
    const body1 = await first;
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    const titles1 = await rowTitles(page);
    await page.screenshot({ path: `${SHOTS}/calls-page-1.png`, fullPage: true });

    const body2 = await answerFor(page, 2, () => page.getByRole('button', { name: 'Next →', exact: true }).click());
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expect(async () => {
      expect(await rowTitles(page)).not.toEqual(titles1);
    }).toPass({ timeout: 30_000 });
    const titles2 = await rowTitles(page);
    await page.screenshot({ path: `${SHOTS}/calls-page-2.png`, fullPage: true });

    const ids1 = body1.topics.map((t) => t.identifier);
    const ids2 = body2.topics.map((t) => t.identifier);
    console.log(`[FO-42] total=${body2.totalResults} page1=${JSON.stringify(ids1.slice(0, 5))} page2=${JSON.stringify(ids2.slice(0, 5))}`);
    expect(body2.pageNumber).toBe(2);
    expect(body2.totalResults).toBe(body1.totalResults);
    expect(ids1.length).toBeGreaterThan(0);
    expect(ids2.length).toBeGreaterThan(0);
    expect(ids2.filter((id) => ids1.includes(id))).toEqual([]);
    expect(titles2.filter((t) => titles1.includes(t))).toEqual([]);

    // Going back lists page 1 again, in the same order the sorted query gave the first time.
    const back = await answerFor(page, 1, () => page.getByRole('button', { name: '← Previous', exact: true }).click());
    expect(back.topics.map((t) => t.identifier)).toEqual(ids1);
  });
});

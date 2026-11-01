import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import tr from '../../messages/tr.json';
import en from '../../messages/en.json';

/**
 * FO-42 re-review finding 1 — SEDIA counts every hit but serves only the first 10 000. With the
 * closed-grants filter it reported 16 651, the pager offered 833 pages at size 20, and page 501
 * came back 400 `page_out_of_window`, which the page called "one of the filters is invalid".
 *
 * `/api/cagrilar` is answered by `page.route` with a 16 651 total, so the walk to the last page
 * takes seconds and the route's per-user limit is not spent. The live run against SEDIA is in
 * calls-page-2-live.spec.ts.
 */

const SHOTS = shotsDir('TASK-MVC67YYIUXGAH');
const SEAT = { id: 'demo-user-superadmin', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CLOSED_TOTAL = 16_651; // live SEDIA, type=1, status=CLOSED (crw-fb-2 report)

const CALLS_FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'cagrilar-response.json'), 'utf8'),
) as { topics: Array<{ identifier: string; title: string }> };

/** Answers every `/api/cagrilar` request with CLOSED_TOTAL hits and records the pages asked for. */
async function stubClosedGrants(page: Page) {
  const asked: Array<{ page: number; limit: number }> = [];
  await page.route('**/api/cagrilar?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const pageNo = Number(params.get('page'));
    const limit = Number(params.get('limit'));
    asked.push({ page: pageNo, limit });
    // Page-specific titles, so the list visibly changes with each page.
    const topics = CALLS_FIXTURE.topics.map((t) => ({ ...t, identifier: `${t.identifier}-p${pageNo}`, title: `${t.title} — p${pageNo}` }));
    await route.fulfill({ json: { success: true, totalResults: CLOSED_TOTAL, pageNumber: pageNo, pageSize: limit, topics } });
  });
  return asked;
}

test.describe('calls page — pager stops at SEDIA\'s 10 000-hit window', () => {
  test('closed grants at 50 per page: "Next" ends on page 200 and page 201 is never asked for', async ({ page }) => {
    test.setTimeout(240_000);
    const T = tr.callsPage;
    const asked = await stubClosedGrants(page);
    await signInAs(page, SEAT);
    await page.goto('/tr/main/calls');
    await expect(page.getByText('1 / 500', { exact: true })).toBeVisible({ timeout: 30_000 });
    // The search box's 400 ms debounce fires once after mount and sets page 1; a walk that
    // starts before it lands on page 1 again halfway through.
    await page.waitForTimeout(600);

    await page.getByRole('combobox').filter({ has: page.locator('option[value="50"]') }).selectOption('50');
    await expect(page.getByText('1 / 200', { exact: true })).toBeVisible({ timeout: 30_000 });
    // The real total is still shown; the note says only the first 10 000 can be read.
    await expect(page.getByText(T.resultsCount.replace('{count}', String(CLOSED_TOTAL)).replace('{page}', '1'))).toBeVisible();
    await expect(page.getByTestId('calls-window-note')).toHaveText('İlk 10.000 sonuç gösteriliyor, aramayı daraltın.');
    await page.screenshot({ path: `${SHOTS}/tr-window-note-page-1.png`, fullPage: true, animations: 'disabled' });

    const next = page.getByRole('button', { name: `${T.next} →`, exact: true });
    for (let n = 2; n <= 200; n += 1) {
      await next.click();
      await expect(page.getByText(`${n} / 200`, { exact: true })).toBeVisible();
      if (n < 200) await expect(next).toBeEnabled();
    }
    await expect(page.getByText(`${CALLS_FIXTURE.topics[0]!.title} — p200`, { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(page.getByTestId('calls-load-error')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/tr-last-reachable-page-200.png`, fullPage: true, animations: 'disabled' });

    // A disabled button cannot be clicked, so force it: still no request past the window.
    await next.click({ force: true });
    await page.waitForTimeout(500);
    const pages50 = asked.filter((a) => a.limit === 50).map((a) => a.page);
    expect(Math.max(...pages50)).toBe(200);
    expect(asked.filter((a) => a.page * a.limit > 10_000)).toEqual([]);
  });

  test('20 per page ends on page 500, not 833 (English)', async ({ page }) => {
    const T = en.callsPage;
    const asked = await stubClosedGrants(page);
    await signInAs(page, SEAT);
    await page.goto('/en/main/calls');

    await expect(page.getByText('1 / 500', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('calls-window-note')).toHaveText('Showing the first 10,000 results; narrow your search.');
    await expect(page.getByText(`${T.next} →`, { exact: true })).toBeEnabled();
    expect(asked.every((a) => a.page * a.limit <= 10_000)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/en-window-note-page-1.png`, fullPage: true, animations: 'disabled' });
  });

  test('a 400 page_out_of_window says the page is too deep, not that a filter is invalid', async ({ page }) => {
    const T = tr.callsPage;
    await page.route('**/api/cagrilar?**', (route) =>
      route.fulfill({ status: 400, json: { success: false, error: 'page_out_of_window' } }),
    );
    await signInAs(page, SEAT);
    await page.goto('/tr/main/calls');

    const error = page.getByTestId('calls-load-error');
    await expect(error).toHaveText(T.loadErrors.pageOutOfWindow.replace('{count, number}', '10.000'), { timeout: 30_000 });
    await expect(error).not.toHaveText(T.loadErrors.badRequest);
    await page.screenshot({ path: `${SHOTS}/tr-page-out-of-window-error.png`, fullPage: true, animations: 'disabled' });
  });

  test('a 400 for another reason still says a filter is invalid', async ({ page }) => {
    await page.route('**/api/cagrilar?**', (route) =>
      route.fulfill({ status: 400, json: { success: false, error: 'invalid_limit' } }),
    );
    await signInAs(page, SEAT);
    await page.goto('/tr/main/calls');
    await expect(page.getByTestId('calls-load-error')).toHaveText(tr.callsPage.loadErrors.badRequest, { timeout: 30_000 });
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import tr from '../../messages/tr.json';
import { SEDIA_RESULT_WINDOW } from '../../src/lib/calls-paging';

/**
 * NG-12 — the calls list is bound to `/api/cagrilar`, and its filters live in the URL.
 *
 * Program tab, status boxes, search, type and page are answered by a stub that reads the
 * query string the page actually sends, so a list that does not follow a filter fails here.
 * The stub applies the route's page window rule (page * size > SEDIA_RESULT_WINDOW → 400
 * page_out_of_window) and nothing else of the route. The real route and SEDIA are not
 * exercised by these tests; the live run against SEDIA is in the report.
 */

const SHOTS = shotsDir('NG-12-screenshots');
const EMAIL = 'admin@yasinaslan.com.tr';
const SEAT = { id: 'demo-user-superadmin', email: EMAIL, tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CALLS_PATH = '/tr/main/calls';
const T = tr.callsPage;

const HORIZON_ID = '43108390';
const EMPTY_ID = '43152860';
/** Rows the stub reports as SEDIA's total for any non-empty answer: 10 pages at the default size of 20. */
const STUB_TOTAL_RESULTS = 200;
const PAGE_SIZE = 20;

const DEFAULT_FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'cagrilar-response.json'), 'utf8'),
) as { topics: Array<{ title: string }> };
const DEFAULT_TITLE = DEFAULT_FIXTURE.topics[0]!.title;
const HORIZON_TITLE = 'NG-12 Horizon fixture: Ufuk Avrupa çağrısı';

/**
 * Answers from the query the page sent: a program gets its own rows, a program with no rows
 * gets an empty 200, and no program gets the default fixture. A page past the window gets the
 * route's 400, as the real route does. Returns every query string the page sent.
 */
async function stubByQuery(page: Page) {
  const seen: URLSearchParams[] = [];
  await page.route('**/api/cagrilar?**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    seen.push(params);
    const pageNumber = Number(params.get('page') ?? '1');
    const size = Number(params.get('limit') ?? String(PAGE_SIZE));
    if (pageNumber * size > SEDIA_RESULT_WINDOW) {
      await route.fulfill({ status: 400, json: { success: false, error: 'page_out_of_window' } });
      return;
    }
    const framework = params.get('framework');
    const topics =
      framework === HORIZON_ID
        ? [{ identifier: 'HORIZON-1', title: HORIZON_TITLE, status: 'OPEN', deadlines: [] }]
        : framework === EMPTY_ID
          ? []
          : DEFAULT_FIXTURE.topics;
    const totalResults = topics.length > 0 ? STUB_TOTAL_RESULTS : 0;
    await route.fulfill({ json: { success: true, totalResults, pageNumber, pageSize: size, topics, translated: true } });
  });
  return seen;
}

async function openCallsAt(page: Page, query = '') {
  await signInAs(page, SEAT);
  await page.goto(`${CALLS_PATH}${query}`);
  await page.waitForURL((url) => url.pathname === CALLS_PATH, { timeout: 30_000 });
}

const programTab = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });
const pagerText = (page: Page, text: string) => page.getByText(text, { exact: true });
const lastRequest = (seen: URLSearchParams[]) => seen[seen.length - 1]!;

test.describe('calls page — filters follow the request and live in the URL', () => {
  test('clicking a program tab changes the list and the URL', async ({ page }) => {
    await stubByQuery(page);
    await openCallsAt(page);
    await expect(page.getByText(DEFAULT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });

    await programTab(page, T.framework.horizon).click();

    await expect(page.getByText(HORIZON_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(DEFAULT_TITLE, { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`framework=${HORIZON_ID}`));
    await expect(programTab(page, T.framework.horizon)).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${SHOTS}/10-filter-horizon.png` });
  });

  test('a filter in the URL is applied on load and survives a reload', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page, `?framework=${HORIZON_ID}&status=OPEN`);

    await expect(page.getByText(HORIZON_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(seen.some((p) => p.get('framework') === HORIZON_ID && p.get('status') === 'OPEN')).toBe(true);
    await expect(programTab(page, T.framework.horizon)).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.getByText(HORIZON_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`framework=${HORIZON_ID}`));
    await expect(programTab(page, T.framework.horizon)).toHaveAttribute('aria-pressed', 'true');
  });

  test('a filter with no matching calls shows the no-results text, not an error', async ({ page }) => {
    await stubByQuery(page);
    await openCallsAt(page, `?framework=${EMPTY_ID}`);

    await expect(page.getByText(T.noResults, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('calls-load-error')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/11-empty-filter.png` });
  });

  test('q, page and type from the URL are sent to the route', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page, '?q=enerji&page=3&type=2');

    await expect(pagerText(page, `3 / ${STUB_TOTAL_RESULTS / PAGE_SIZE}`)).toBeVisible({ timeout: 30_000 });
    expect(seen.some((p) => p.get('q') === 'enerji' && p.get('page') === '3' && p.get('type') === '2')).toBe(true);
  });
});

test.describe('calls page — hand-edited URLs fall back to defaults', () => {
  for (const query of [
    '?framework=evil&status=bogus&type=9&page=-1',
    '?page=999999',
    '?page=1e21',
    '?status=',
  ]) {
    test(`${query} loads the list without an error and drops the invalid values from the URL`, async ({ page }) => {
      const seen = await stubByQuery(page);
      await openCallsAt(page, query);

      await expect(page.getByText(DEFAULT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('calls-load-error')).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).search).toBe('');
      const sent = lastRequest(seen);
      expect(sent.get('framework')).toBeNull();
      expect(sent.get('page')).toBe('1');
      expect(sent.get('type')).toBe('1');
      expect(sent.get('status')).toBe('OPEN,FORTHCOMING');
    });
  }

  test('a page past the result total is clamped to the last page', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page, '?page=400');

    const lastPage = STUB_TOTAL_RESULTS / PAGE_SIZE;
    await expect(pagerText(page, `${lastPage} / ${lastPage}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('calls-load-error')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(String(lastPage));
    expect(lastRequest(seen).get('page')).toBe(String(lastPage));
  });
});

test.describe('calls page — the filter controls change the request', () => {
  test('changing the search text goes back to page 1', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page, '?page=3');
    await expect(pagerText(page, '3 / 10')).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder(T.searchPlaceholder).fill('enerji');

    await expect(pagerText(page, '1 / 10')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/q=enerji/);
    await expect(page).not.toHaveURL(/page=/);
    expect(lastRequest(seen).get('q')).toBe('enerji');
    expect(lastRequest(seen).get('page')).toBe('1');
  });

  test('the last status box cannot be unticked', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page, '?status=CLOSED');
    await expect(page.getByText(DEFAULT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });

    const closedBox = page.getByLabel(T.closed, { exact: true });
    await closedBox.click();

    await expect(closedBox).toBeChecked();
    await expect(page).toHaveURL(/status=CLOSED/);
    expect(lastRequest(seen).get('status')).toBe('CLOSED');
  });

  test('unticking one of two status boxes removes it from the request and the URL', async ({ page }) => {
    const seen = await stubByQuery(page);
    await openCallsAt(page);
    await expect(page.getByText(DEFAULT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel(T.openCalls, { exact: true }).click();

    await expect(page.getByLabel(T.openCalls, { exact: true })).not.toBeChecked();
    await expect(page).toHaveURL(/status=FORTHCOMING/);
    await expect(page).not.toHaveURL(/status=[^&]*OPEN/);
    await expect.poll(() => lastRequest(seen).get('status')).toBe('FORTHCOMING');
  });
});

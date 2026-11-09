import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import tr from '../../messages/tr.json';

/**
 * NG-12 — the calls list is bound to `/api/cagrilar`, and its filters live in the URL.
 *
 * Program tab, status boxes and search are answered by a stub that reads the query string
 * the page actually sends, so a list that does not follow the filter fails here. The real
 * route is not exercised; the live run against SEDIA is in the report.
 */

const SHOTS = shotsDir('NG-12-screenshots');
const EMAIL = 'admin@yasinaslan.com.tr';
const SEAT = { id: 'demo-user-superadmin', email: EMAIL, tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CALLS_PATH = '/tr/main/calls';
const T = tr.callsPage;

const HORIZON_ID = '43108390';
const EMPTY_ID = '43152860';

const DEFAULT_FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'cagrilar-response.json'), 'utf8'),
) as { topics: Array<{ title: string }> };
const DEFAULT_TITLE = DEFAULT_FIXTURE.topics[0]!.title;
const HORIZON_TITLE = 'NG-12 Horizon fixture: Ufuk Avrupa çağrısı';

/**
 * Answers from the query the page sent: a program gets its own rows, a program with no rows
 * gets an empty 200, and no program gets the default fixture.
 */
async function stubByQuery(page: Page) {
  const seen: URLSearchParams[] = [];
  await page.route('**/api/cagrilar?**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    seen.push(params);
    const framework = params.get('framework');
    const topics =
      framework === HORIZON_ID
        ? [{ identifier: 'HORIZON-1', title: HORIZON_TITLE, status: 'OPEN', deadlines: [] }]
        : framework === EMPTY_ID
          ? []
          : DEFAULT_FIXTURE.topics;
    await route.fulfill({ json: { success: true, totalResults: topics.length, pageNumber: 1, pageSize: 20, topics, translated: true } });
  });
  return seen;
}

async function openCallsAt(page: Page, query = '') {
  await signInAs(page, SEAT);
  await page.goto(`${CALLS_PATH}${query}`);
  await page.waitForURL((url) => url.pathname === CALLS_PATH, { timeout: 30_000 });
}

const programTab = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });

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
});

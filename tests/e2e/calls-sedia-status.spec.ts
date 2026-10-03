import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import tr from '../../messages/tr.json';

/**
 * TASK-MUSBZX8ROL52A — the SEDIA badge on the calls page and the error text under the table.
 *
 * The badge used to be a static green "SEDIA Canlı API Bağlantısı Etkin" whatever happened, and
 * every failed `/api/cagrilar` request showed one sentence blaming the EU portal, including a
 * 429 from our own per-user limiter and a 400 for a bad parameter. The badge now follows the
 * last request and each failure has its own sentence.
 *
 * `/api/cagrilar` is answered by `page.route`, so each status is produced exactly. The real
 * route is not exercised here; the report covers that with a live run against a blocked SEDIA.
 */

const SHOTS = shotsDir('TASK-MUSBZX8ROL52A-screenshots');
const EMAIL = 'admin@yasinaslan.com.tr';
// The seeded platform-admin seat behind EMAIL (prisma/seed-tenant-workspace.ts). The demo
// sign-in form that used to resolve the address to it does not exist in a production build
// (start mode: `locator.fill` on the email field timed out, CI run 37134974386), so the session
// is a minted cookie for the same user (TASK-MUSNBNCXVR9GZ), as render-purity-refactor does
// for this page. The jwt callback still reads the admin flag from the row.
const SEAT = { id: 'demo-user-superadmin', email: EMAIL, tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CALLS_URL = '/tr/main/calls';
const T = tr.callsPage;

const CALLS_FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'cagrilar-response.json'), 'utf8'),
) as { topics: Array<{ title: string }> };

type Answer = (route: Route) => Promise<void>;

const ok: Answer = (route) => route.fulfill({ json: CALLS_FIXTURE });
const status =
  (code: number, body: object, headers: Record<string, string> = {}): Answer =>
  (route) =>
    route.fulfill({ status: code, json: body, headers });

/**
 * Holds every request until `release()` and then answers it with `then`, so the state before
 * the first response is observed for as long as the test needs, not for however long the
 * network happened to take.
 */
function held(then: Answer) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer: Answer = async (route) => {
    await gate;
    await then(route);
  };
  return { answer, release };
}

/** Every `/api/cagrilar` request is answered by `next`, which a test can swap between requests. */
async function stubCalls(page: Page, first: Answer) {
  const state = { next: first, count: 0 };
  await page.route('**/api/cagrilar?**', async (route) => {
    state.count += 1;
    await state.next(route);
  });
  return state;
}

async function openCalls(page: Page) {
  // signInAs also records the cookie consent the banner would otherwise ask for.
  await signInAs(page, SEAT);
  await page.goto(CALLS_URL);
  await page.waitForURL(`**${CALLS_URL}`, { timeout: 30_000 });
}

const badge = (page: Page) => page.getByTestId('sedia-status');
const loadError = (page: Page) => page.getByTestId('calls-load-error');

test.describe('calls page — SEDIA badge and error text follow the real request', () => {
  test('before the first response the badge says "checking", not green or red', async ({ page }) => {
    const first = held(ok);
    const calls = await stubCalls(page, first.answer);
    await openCalls(page);

    // The request has reached the gate, so the page is waiting on it, not about to send it.
    await expect.poll(() => calls.count, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(badge(page)).toHaveAttribute('data-state', 'checking');
    await expect(badge(page)).toHaveText(T.liveApiChecking);
    await page.screenshot({ path: `${SHOTS}/00-badge-checking.png` });

    first.release();
    await expect(badge(page)).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
    await expect(badge(page)).toHaveText(T.liveApiActive);
    await expect(loadError(page)).toHaveCount(0);
  });

  test('a successful list turns the badge green', async ({ page }) => {
    await stubCalls(page, ok);
    await openCalls(page);

    await expect(badge(page)).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
    await expect(badge(page)).toHaveText(T.liveApiActive);
    await expect(page.getByText(CALLS_FIXTURE.topics[0]!.title, { exact: true })).toBeVisible();
    await expect(loadError(page)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/01-badge-live.png` });
  });

  test('503 from SEDIA: red badge and the "portal did not answer" text', async ({ page }) => {
    await stubCalls(page, status(503, { success: false, error: 'sedia_unavailable' }, { 'Retry-After': '30' }));
    await openCalls(page);

    await expect(badge(page)).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(badge(page)).toHaveText(T.liveApiFailed);
    await expect(loadError(page)).toHaveText(T.loadErrors.sediaUnavailable);
    await page.screenshot({ path: `${SHOTS}/02-badge-failed-503.png` });
  });

  test('429 from our limiter: says to wait Retry-After seconds, does not blame SEDIA', async ({ page }) => {
    await stubCalls(page, status(429, { success: false, error: 'rate_limited' }, { 'Retry-After': '42' }));
    await openCalls(page);

    await expect(badge(page)).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(loadError(page)).toHaveText(T.loadErrors.rateLimited.replace('{seconds}', '42'));
    await expect(loadError(page)).not.toContainText('SEDIA');
    await page.screenshot({ path: `${SHOTS}/03-error-429.png` });
  });

  test('400 for a rejected parameter: says the request was invalid, does not blame SEDIA', async ({ page }) => {
    await stubCalls(page, status(400, { success: false, error: 'invalid_limit' }));
    await openCalls(page);

    await expect(badge(page)).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(loadError(page)).toHaveText(T.loadErrors.badRequest);
    await expect(loadError(page)).not.toContainText('SEDIA');
    await page.screenshot({ path: `${SHOTS}/04-error-400.png` });
  });

  test('network failure: says the server could not be reached', async ({ page }) => {
    await stubCalls(page, (route) => route.abort('internetdisconnected'));
    await openCalls(page);

    await expect(badge(page)).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(loadError(page)).toHaveText(T.loadErrors.network);
  });

  test('a failed badge goes green again once a later request succeeds', async ({ page }) => {
    const calls = await stubCalls(page, status(503, { success: false, error: 'sedia_unavailable' }));
    await openCalls(page);
    await expect(badge(page)).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });

    calls.next = ok;
    await page.getByRole('button', { name: T.framework.horizon, exact: true }).click();
    await expect(badge(page)).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
    await expect(loadError(page)).toHaveCount(0);
  });
});

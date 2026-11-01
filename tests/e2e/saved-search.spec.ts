import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { SAVED_SEARCH_ALERT_QUERY } from '../../src/lib/jobs/tasks/alerts-daily';
import { parseSavedSearchFilters } from '../../src/lib/saved-search-filters';
import { SAVED_SEARCH_E2E, seed, rollback } from '../../scripts/seed-saved-search-e2e';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { seedIdentity, signInAs, cleanupIdentity } from './fixtures/session';

/**
 * TASK-MTSHUZUMVLTBF — the "Aramayı Kaydet" button, clicked, and the row it wrote.
 *
 * This button has been silently broken twice. TASK-MTS6M5819RW93 found it was a
 * 500 ms `setTimeout` and a toast: it wrote nothing at all, so `alerts-daily`
 * — whose whole job is to read `SavedSearch` rows with `notify: true` — had
 * never had a single row to read in production. TASK-MTS9W0C1VC9OS then found
 * the route it was given returned 500 on a clean install, because an undeclared
 * `resend` reached its compile graph. Neither was caught before a human looked,
 * because nothing clicked this button.
 *
 * The unit suite covers the route handler (`src/app/api/saved-searches/route.test.ts`)
 * and it passed through both faults: the first was in the client, the second in
 * module resolution, and mocks see neither. So the assertions here are
 * deliberately end-to-end — a real click in a real browser, then the row read
 * straight out of Postgres, then the same row read back through the *cron's own
 * query*. That last step is the one that matters: a row that exists but that
 * `SAVED_SEARCH_ALERT_QUERY` does not return would leave the alert e-mail just
 * as empty as writing no row at all.
 */

const SHOTS = shotsDir('TASK-MTSHUZUMVLTBF-screenshots');
const CALLS_URL = `/tr/${SAVED_SEARCH_E2E.workspaceSlug}/calls`;

/** Typed into the search box, so the saved row's name and filter are the test's own. */
const QUERY = 'e2e hydrogen storage';

test.describe.configure({ mode: 'serial' });

test.describe('Saved search — the button writes a row the alert job can read', () => {
  test.beforeAll(async () => {
    await seed();
    await seedIdentity({
      userId: SAVED_SEARCH_E2E.userId,
      email: SAVED_SEARCH_E2E.email,
      role: 'TENANT_OWNER',
      tenantId: SAVED_SEARCH_E2E.tenantId,
      workspaceIds: [SAVED_SEARCH_E2E.workspaceId],
    });
  });

  test.afterAll(async () => {
    await cleanupIdentity([SAVED_SEARCH_E2E.userId]);
    // SAVED_SEARCH_E2E_KEEP=1 leaves the rows in place for inspection after a run.
    if (process.env.SAVED_SEARCH_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('a click on "Aramayı Kaydet" creates the SavedSearch row', async ({ page }) => {
    await signInAs(page, {
      id: SAVED_SEARCH_E2E.userId,
      email: SAVED_SEARCH_E2E.email,
      role: 'TENANT_OWNER',
      tenantId: SAVED_SEARCH_E2E.tenantId,
    });
    await page.goto(CALLS_URL);

    // Asserted before the click, not assumed: the fixture must start with nothing
    // saved, or a leftover row would let a dead button pass this test.
    expect(
      await prisma.savedSearch.count({ where: { tenantId: SAVED_SEARCH_E2E.tenantId } }),
    ).toBe(0);

    const button = page.getByTestId('calls-save-search');
    await expect(button).toBeVisible({ timeout: 30_000 });
    // The label is the user-facing contract the card is named after, and it is
    // also this control's accessible name — pinned once, here.
    await expect(button).toHaveAccessibleName(/Aramayı Kaydet/);

    // Both the saved row's name and its `q` filter come from `debouncedSearch`,
    // and the box debounces by 400 ms — typing and clicking in the same tick
    // would save the empty-query fallback, and every assertion below would then
    // be measuring a row the test did not intend. The list asks
    // `/api/cagrilar?…&q=<query>` from the same debounced value, so that request
    // leaving the page is the signal that the value has landed. The waiter is
    // armed before the keystroke, and only the request is awaited — SEDIA is a
    // live upstream and its response time is not this test's business.
    const debouncedQuery = page.waitForRequest(
      (r) => new URL(r.url()).searchParams.get('q') === QUERY,
      { timeout: 30_000 },
    );
    // The box is a controlled input: text typed into the server-rendered markup is reset
    // to '' when React hydrates it, and no debounced request ever leaves (CI run
    // 36508751097 — the failure screenshot shows the box empty and focused).
    const searchBox = page.locator('input[type="text"]').first();
    await expectHydrated(searchBox);
    await searchBox.fill(QUERY);
    await debouncedQuery;

    await expect(button).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/01-before-save.png`, fullPage: true });

    await button.click();

    // The two bands the click can produce, waited for as a pair: if the POST 500s
    // the run fails on the error band's own message instead of timing out on the
    // success band, where the reason would be invisible. Scoped by test id rather
    // than by role alone — `FeedbackWidget` is mounted on every app page and holds
    // a `role="alert"` node of its own, so a bare `getByRole('alert')` was never
    // measuring this feature (it failed against a saved row sitting on screen).
    const statusBand = page.getByTestId('calls-save-search-status');
    const errorBand = page.getByTestId('calls-save-search-error');
    await expect(statusBand.or(errorBand)).toBeVisible({ timeout: 30_000 });
    await expect(errorBand).toHaveCount(0);
    await expect(statusBand).toContainText(QUERY);
    // The band is announced, not merely coloured — a save this test can see must
    // also reach a screen reader.
    await expect(statusBand).toHaveRole('status');

    // The list re-fetches from GET /api/saved-searches, so this proves the row
    // survives a round trip through the API and not just the optimistic state.
    const list = page.getByTestId('calls-saved-search-list');
    await expect(list).toBeVisible({ timeout: 30_000 });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText(QUERY);
    await page.screenshot({ path: `${SHOTS}/02-after-save.png`, fullPage: true });

    // The row the click wrote, read straight from Postgres.
    const rows = await prisma.savedSearch.findMany({
      where: { tenantId: SAVED_SEARCH_E2E.tenantId },
    });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.userId).toBe(SAVED_SEARCH_E2E.userId);
    expect(row.name).toBe(QUERY);
    // `notify: true` is what puts the row in the daily job's inbox at all.
    expect(row.notify).toBe(true);

    // `filters` is a bare Json column; read it the way the cron reads it, so a
    // shape the reader would silently drop to "no filter" fails here instead.
    expect(parseSavedSearchFilters(row.filters)).toEqual({
      q: QUERY,
      status: ['OPEN', 'FORTHCOMING'],
    });
  });

  test('the row the click wrote is one the daily alert job would pick up', async () => {
    // The cron's own query, verbatim, narrowed to the fixture tenant — the step
    // between "a row exists" and "the alert e-mail stops being empty".
    const visible = await prisma.savedSearch.findMany({
      ...SAVED_SEARCH_ALERT_QUERY,
      where: { ...SAVED_SEARCH_ALERT_QUERY.where, tenantId: SAVED_SEARCH_E2E.tenantId },
    });

    expect(visible).toHaveLength(1);
    expect(visible[0]!.name).toBe(QUERY);
    // `alerts-daily` needs an owner e-mail to send to; without one it counts the
    // search as failed and sends nothing.
    const owner = await prisma.membership.findFirst({
      where: { tenantId: SAVED_SEARCH_E2E.tenantId, role: 'TENANT_OWNER' },
    });
    expect(owner).not.toBeNull();
  });

  test('deleting a saved search removes its row', async ({ page }) => {
    await signInAs(page, {
      id: SAVED_SEARCH_E2E.userId,
      email: SAVED_SEARCH_E2E.email,
      role: 'TENANT_OWNER',
      tenantId: SAVED_SEARCH_E2E.tenantId,
    });
    await page.goto(CALLS_URL);

    const list = page.getByTestId('calls-saved-search-list');
    await expect(list).toBeVisible({ timeout: 30_000 });
    await list.getByRole('button', { name: 'Sil' }).click();

    await expect(page.getByTestId('calls-save-search-error')).toHaveCount(0);
    await expect(list).toHaveCount(0, { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/03-after-delete.png`, fullPage: true });

    expect(
      await prisma.savedSearch.count({ where: { tenantId: SAVED_SEARCH_E2E.tenantId } }),
    ).toBe(0);
  });
});

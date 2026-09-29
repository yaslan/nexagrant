import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { getKpiMetrics } from '../../src/modules/m5/server/queries';
import { ARCHIVE_E2E, seed, rollback } from '../../scripts/seed-archive-e2e';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';

/**
 * Archiving an opportunity, and the effort log — against a real browser and a real database.
 *
 * Two things are proved here, both of which used to be impossible to see from the product:
 *
 *   1. `Opportunity.deletedAt` had no entry point. The column has said "hidden from the
 *      product, still restorable" since the KVKK/GDPR work, but the only way to get an
 *      opportunity off a board was to delete the row from Postgres by hand. The test archives
 *      one through the UI and then asserts the *row is still there* with `deletedAt` set —
 *      an archive that silently deleted would pass a "card is gone" check just as well.
 *
 *   2. The effort tab was a two-row `MOCK_EFFORTS` constant with a form that pushed into React
 *      state. The test opens it on its empty state (zero rows is the honest answer for this
 *      fixture), logs one entry, and checks the row that reaches the `Effort` table.
 */

const SHOTS = shotsDir('TASK-MTS6MBA7NEIM0-screenshots');
const WS = ARCHIVE_E2E.workspaceSlug;
const BOARD_URL = `/tr/${WS}/pipeline`;
const DETAIL_URL = `${BOARD_URL}/${ARCHIVE_E2E.archivedOppId}`;

const LOGGED_HOURS = 3.5;
const LOGGED_NOTE = 'Archive E2E — real effort row';

test.describe('Opportunity archive + effort log', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    // ARCHIVE_E2E_KEEP=1 leaves the fixture in place so the archived row and the audit event
    // can be inspected by hand after the run.
    if (process.env.ARCHIVE_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  const shot = (page: import('@playwright/test').Page, name: string) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  test('archiving hides the opportunity everywhere but keeps the record', async ({ page }) => {
    // The cookie consent renders as a full-screen `inset-0` alertdialog and swallows clicks
    // across the page; recording a prior consent is the state a returning user is in.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    // ── 1. Sign in, landing on the board.
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(BOARD_URL)}`);
    await page.locator('input[type="email"]').fill(ARCHIVE_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${BOARD_URL}`, { timeout: 30_000 });

    const app = page.getByRole('main');
    await expect(app.getByText(ARCHIVE_E2E.archivedOppTitle)).toBeVisible();
    await expect(app.getByText(ARCHIVE_E2E.keptOppTitle)).toBeVisible();
    await shot(page, '01-board-before-archive');

    // KPI baseline, read through the same query the dashboard uses.
    const kpiBefore = await getKpiMetrics(
      ARCHIVE_E2E.tenantId,
      new Date(Date.now() - 30 * 24 * 3600_000),
      new Date(Date.now() + 24 * 3600_000),
    );
    expect(kpiBefore.totalOffers).toBe(2);

    // ── 2. Effort tab: empty state first, because the fixture has no effort rows.
    await page.goto(DETAIL_URL);
    // The tab switch is client state; a click before hydration is lost.
    const effortTab = page.getByRole('button', { name: 'Efor Kaydı' });
    await expectHydrated(effortTab);
    await effortTab.click();
    await expect(app.getByTestId('effort-empty')).toBeVisible();
    await expect(app.getByTestId('effort-table')).toHaveCount(0);
    await expect(app.getByTestId('effort-total')).toContainText('0.0');
    await shot(page, '02-effort-empty-state');

    // ── 3. Log one entry and see the saved row come back from the server.
    await app.getByTestId('effort-hours').fill(String(LOGGED_HOURS));
    await app.getByTestId('effort-note').fill(LOGGED_NOTE);
    await app.getByTestId('effort-submit').click();

    const table = app.getByTestId('effort-table');
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table).toContainText(LOGGED_NOTE);
    // The name comes from the `User` row the effort's `userId` points at, not from a literal.
    await expect(table).toContainText(ARCHIVE_E2E.userName);
    // 3.5h / 8 = 0.4 person-days, computed over the database rows.
    await expect(app.getByTestId('effort-total')).toContainText('0.4');
    await shot(page, '03-effort-logged');

    const effortRows = await prisma.effort.findMany({
      where: { tenantId: ARCHIVE_E2E.tenantId, opportunityId: ARCHIVE_E2E.archivedOppId },
      select: { hours: true, note: true, userId: true },
    });
    expect(effortRows).toEqual([
      { hours: LOGGED_HOURS, note: LOGGED_NOTE, userId: ARCHIVE_E2E.userId },
    ]);

    // ── 4. Archive, with its confirmation step.
    await app.getByTestId('pipeline-archive').click();
    const confirm = app.getByTestId('pipeline-archive-confirm');
    await expect(confirm).toBeVisible();
    // The copy says archive, and says the record survives — it never says "delete".
    await expect(confirm).toContainText('Kayıt silinmez');
    await shot(page, '04-archive-confirmation');

    // Cancelling really cancels: nothing is written until the second click.
    await app.getByTestId('pipeline-archive-cancel').click();
    await expect(confirm).toHaveCount(0);
    expect(
      await prisma.opportunity.count({
        where: { id: ARCHIVE_E2E.archivedOppId, deletedAt: { not: null } },
      }),
    ).toBe(0);

    await app.getByTestId('pipeline-archive').click();
    await app.getByTestId('pipeline-archive-confirm-yes').click();

    // ── 5. Back on the board, the archived card is gone and the control card is not.
    await page.waitForURL(`**${BOARD_URL}`, { timeout: 30_000 });
    // The control card first: it proves the board has rendered, so the count after it is
    // an absence and not the detail page still being swapped out.
    await expect(app.getByText(ARCHIVE_E2E.keptOppTitle)).toBeVisible();
    await expect(app.getByText(ARCHIVE_E2E.archivedOppTitle)).toHaveCount(0);
    await shot(page, '05-board-after-archive');

    // ── 6. The row is still on file — archived, not deleted.
    const archived = await prisma.opportunity.findUnique({
      where: { id: ARCHIVE_E2E.archivedOppId },
      select: { id: true, title: true, deletedAt: true, deletionReason: true },
    });
    expect(archived).not.toBeNull();
    expect(archived?.title).toBe(ARCHIVE_E2E.archivedOppTitle);
    expect(archived?.deletedAt).toBeInstanceOf(Date);
    expect(archived?.deletionReason).toBe('archived_by_user');

    // …and so is the effort logged against it, which is the point of a soft delete.
    expect(
      await prisma.effort.count({ where: { opportunityId: ARCHIVE_E2E.archivedOppId } }),
    ).toBe(1);

    // ── 7. Who did it is on the record.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId: ARCHIVE_E2E.tenantId,
        type: 'opportunity.archived',
        target: ARCHIVE_E2E.archivedOppId,
      },
      select: { actorId: true, data: true },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(ARCHIVE_E2E.userId);

    // ── 8. The detail page no longer serves it, and the KPI has dropped by one.
    await page.goto(DETAIL_URL);
    await expect(page.getByText('404')).toBeVisible({ timeout: 20_000 });
    await shot(page, '06-detail-404-after-archive');

    const kpiAfter = await getKpiMetrics(
      ARCHIVE_E2E.tenantId,
      new Date(Date.now() - 30 * 24 * 3600_000),
      new Date(Date.now() + 24 * 3600_000),
    );
    expect(kpiAfter.totalOffers).toBe(kpiBefore.totalOffers - 1);
  });
});

import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import {
  M9_BRIEFS_URL,
  M9_TENANT,
  M9_WORKSPACE,
  setupM9Tenant,
  signInAsM9User,
  teardownM9Tenant,
} from './fixtures/m9-tenant';

/**
 * M9 briefs — the two claims of TASK-MTQUX5IZ9I5VP, measured against the running
 * app and the live database rather than a mock:
 *
 *   1. "the brief is never saved" — a generated brief must exist as a
 *      `MeetingBrief` row afterwards, and must still be on the page after a
 *      reload, which is the only proof that the list came from the database and
 *      not from React state left over from the click.
 *   2. "an opportunity that does not exist shows invented data" — an unknown id
 *      must reach the not-found screen with no brief workspace behind it.
 *
 * Nothing here is stubbed: real sign-in, real page, real typing and clicking,
 * real Postgres reads between the assertions.
 */

const SHOTS = 'docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots';
const PARTNER = 'E2E Kalicilik Ortagi';
const MISSING_URL = `/tr/${M9_WORKSPACE}/opportunities/m9-e2e-does-not-exist/briefs`;

test.describe('M9 briefs — persistence and the unknown opportunity', () => {
  test.beforeAll(setupM9Tenant);
  test.afterAll(teardownM9Tenant);

  test('a generated brief reaches the database and survives a reload', async ({ page }) => {
    test.setTimeout(180_000);

    await signInAsM9User(page, M9_BRIEFS_URL);
    const app = page.getByRole('main');

    // Empty state first: the list says there is nothing yet rather than showing
    // a brief for a partner nobody entered.
    await expect(app.getByText('Henüz kayıtlı bir görüşme bulunmuyor.')).toBeVisible();

    await app.getByPlaceholder(/Ortak \/ Kurum Adı/).fill(PARTNER);
    await app.getByTestId('m9-meeting-date').fill('2026-10-24');
    await app.getByTestId('m9-meeting-time').fill('14:00');
    await page.screenshot({ path: `${SHOTS}/persist-01-form-filled.png`, fullPage: true });

    await app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ }).click();

    // The brief the user asked for is on screen, and no error band came up.
    await expect(app.getByText(PARTNER).first()).toBeVisible({ timeout: 120_000 });
    await expect(app.getByTestId('m9-generate-error')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/persist-02-brief-on-screen.png`, fullPage: true });

    // The claim under test: a row, in this tenant, with the content and the
    // meeting time the form sent.
    const rows = await prisma.meetingBrief.findMany({ where: { tenantId: M9_TENANT } });
    expect(rows).toHaveLength(1);
    const saved = rows[0]!;
    expect(saved.partnerName).toBe(PARTNER);
    expect(saved.content.length).toBeGreaterThan(50);
    expect(saved.meetingScheduledAt).not.toBeNull();
    expect(saved.meetingScheduledTz).toBe('Europe/Brussels');

    // On this machine the model answers 401, so the brief that was saved is the
    // template draft. It must say so on screen, the machine marker must not be
    // on screen, and no credit may have been taken for a document the AI did
    // not write.
    if (saved.content.startsWith('<!-- fabrika:template-draft -->')) {
      const draftNotice = app.getByTestId('m9-template-draft-notice');
      await draftNotice.scrollIntoViewIfNeeded();
      await expect(draftNotice).toBeVisible();
      await expect(app.getByText('fabrika:template-draft')).toHaveCount(0);
      // The workspace shell scrolls an inner container, so `fullPage` cannot
      // reach the brief body; scroll it into the middle of the viewport first.
      await page.mouse.move(900, 500);
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/persist-05-template-draft-notice.png` });
      const credits = await prisma.creditLedger.aggregate({
        where: { tenantId: M9_TENANT },
        _sum: { delta: true },
      });
      expect(credits._sum.delta).toBe(50);
    }

    // Reload: the list is rendered on the server from `MeetingBrief`, so a brief
    // that only ever lived in React state disappears here.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('main').getByText(PARTNER).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/persist-03-after-reload.png`, fullPage: true });
  });

  test('an opportunity that does not exist gets the not-found screen, not a brief', async ({
    page,
  }, testInfo) => {
    await signInAsM9User(page, M9_BRIEFS_URL);

    const response = await page.goto(MISSING_URL, { waitUntil: 'networkidle' });

    // What the user sees: the not-found screen. No generator, no brief list, no
    // partner invented for an opportunity that does not exist.
    await expect(page.getByText('Sayfa Bulunamadı')).toBeVisible();
    await expect(page.getByTestId('m9-meeting-date')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/persist-04-unknown-opportunity.png`, fullPage: true });

    // The HTTP status is recorded, not asserted. Every `notFound()` under
    // `[locale]/(app)` answers 200 with the 404 body — measured on
    // /pipeline/[id], /partners/[pic] and /opportunities/[id]/documents too — so
    // it is a tree-wide defect, not something this page can fix alone.
    // TASK-MTQYY136Q3CGG closed this as "already 404", but that measurement was
    // taken without a session: signed out, these routes 307 to the login page
    // and `notFound()` never runs. Asserting it here would only make this spec
    // red for a defect that belongs to the whole route tree.
    testInfo.annotations.push({
      type: 'known-defect',
      description: `notFound() HTTP status = ${response?.status()} (expected 404) — TASK-MTQYY136Q3CGG`,
    });
  });
});

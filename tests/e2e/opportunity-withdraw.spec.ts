import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { WITHDRAW_E2E, seed, rollback } from '../../scripts/seed-withdraw-e2e';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * Withdrawing an opportunity ("vazgeç") with a reason — NG-15 on a real browser and database.
 *
 * Two things are proved here:
 *
 *   1. A withdrawal without a reason is refused by the server and the refusal is shown; the
 *      database is unchanged (status still ACTIVE, no decision_log row). The UI does not
 *      decide this rule — it only sends the request and shows what came back.
 *
 *   2. A withdrawal with a reason writes the status WITHDRAWN and one decision_log row carrying
 *      the trimmed reason in the same transaction, and the reason reads back on the page.
 */

const SHOTS = shotsDir('NG-15-screenshots');
const DETAIL_URL = `/tr/${WITHDRAW_E2E.workspaceSlug}/pipeline/${WITHDRAW_E2E.oppId}`;
const REASON = '  Ortak bulunamadı  ';
const REASON_TRIMMED = 'Ortak bulunamadı';

test.describe('Opportunity withdraw with a reason', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.WITHDRAW_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  const shot = (page: import('@playwright/test').Page, name: string) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  test('a withdrawal without a reason is refused; with one it is written and read back', async ({ page }) => {
    await signInAs(page, {
      id: WITHDRAW_E2E.userId,
      email: WITHDRAW_E2E.email,
      name: WITHDRAW_E2E.userName,
      role: 'TENANT_OWNER',
      tenantId: WITHDRAW_E2E.tenantId,
    });
    await page.goto(DETAIL_URL);

    const app = page.getByRole('main');
    const openButton = app.getByTestId('pipeline-withdraw-open');
    await expectHydrated(openButton);
    await shot(page, '01-detail-before-withdraw');

    // ── 1. Empty reason: the server refuses, the UI shows the refusal, nothing is written.
    await openButton.click();
    await app.getByTestId('pipeline-withdraw-submit').click();
    const error = app.getByTestId('pipeline-withdraw-error');
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText('gerekçe');
    await shot(page, '02-withdraw-refused-without-reason');

    const afterRefusal = await prisma.opportunity.findUnique({
      where: { id: WITHDRAW_E2E.oppId },
      select: { status: true },
    });
    expect(afterRefusal?.status).toBe('ACTIVE');
    expect(
      await prisma.decisionLog.count({
        where: { tenantId: WITHDRAW_E2E.tenantId, opportunityId: WITHDRAW_E2E.oppId },
      }),
    ).toBe(0);

    // ── 2. With a reason: the withdrawal is written and the reason is on the page.
    await app.getByTestId('pipeline-withdraw-reason').fill(REASON);
    await app.getByTestId('pipeline-withdraw-submit').click();

    const warning = app.getByTestId('pipeline-withdrawn-warning');
    await expect(warning).toBeVisible({ timeout: 20_000 });
    await expect(warning).toContainText('pasife alındı');
    const log = app.getByTestId('pipeline-decision-log');
    await expect(log).toContainText(REASON_TRIMMED);
    // A withdrawn opportunity takes no application declaration: the declare control is gone.
    await expect(app.getByTestId('pipeline-declare-submitted')).toHaveCount(0);
    await shot(page, '03-detail-after-withdraw');

    // The status and the decision row are both on file, written by the one transaction.
    const opp = await prisma.opportunity.findUnique({
      where: { id: WITHDRAW_E2E.oppId },
      select: { status: true },
    });
    expect(opp?.status).toBe('WITHDRAWN');

    const decisions = await prisma.decisionLog.findMany({
      where: { tenantId: WITHDRAW_E2E.tenantId, opportunityId: WITHDRAW_E2E.oppId },
      select: { kind: true, reason: true, decidedById: true },
    });
    expect(decisions).toEqual([
      { kind: 'WITHDRAW', reason: REASON_TRIMMED, decidedById: WITHDRAW_E2E.userId },
    ]);
  });
});

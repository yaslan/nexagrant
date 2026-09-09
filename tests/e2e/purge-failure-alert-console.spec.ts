import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { purgeDueUsers } from '../../src/lib/inngest/jobs/users-scheduled-deletion';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTTOUDNQ97X83 F-1 — the alarm an operator actually sees.
 *
 * A row in `SystemAlert` is a record, not a document. The fix is only worth
 * anything if the failed erasure reaches the screen a platform admin reads, so
 * this spec makes the erasure job fail for real (the pre-migration NOT NULL
 * column, exactly the ordering that caused the original silence), then opens
 * /admin/alerts in a browser and looks for the row.
 *
 * LOCAL DEV DATABASE ONLY: it alters a column and puts it back in `afterAll`.
 */

const SHOTS = shotsDir('TASK-MTTOUDNQ97X83-screenshots');
const ADMIN_EMAIL = 'admin@yasinaslan.com.tr';
const RUN = Date.now().toString(36);
const ids = {
  tenant: `purge-alert-t-${RUN}`,
  subject: `purge-alert-s-${RUN}`,
  rel: `purge-alert-r-${RUN}`,
};

let skipReason = '';

test.describe.configure({ mode: 'serial' });

test.describe('erasure failure reaches the alerts console', () => {
  test.beforeAll(async () => {
    // `SET NOT NULL` cannot be applied while any row is already NULL, so a
    // database that has unassigned relationships is not measurable here.
    if ((await prisma.relationship.count({ where: { ownerUserId: null } })) > 0) {
      skipReason = 'database already has unassigned relationships; column cannot be pinned';
      return;
    }
    if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
      skipReason = `no platform admin ${ADMIN_EMAIL} in this database`;
      return;
    }

    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 60);
    await prisma.tenant.create({
      data: { id: ids.tenant, name: `Purge Alert ${RUN}`, slug: `purge-alert-${RUN}`, country: 'TR' },
    });
    await prisma.user.create({
      data: {
        id: ids.subject,
        email: `purge-alert-${RUN}@qa.invalid`,
        name: 'QA Subject',
        deletionRequestedAt: past,
        deletionReason: 'qa probe',
      },
    });
    await prisma.relationship.create({
      data: {
        id: ids.rel,
        tenantId: ids.tenant,
        kind: 'partner',
        ownerUserId: ids.subject,
        counterpartName: `Partner ${RUN}`,
        warmth: 'warm',
      },
    });

    await prisma.$executeRawUnsafe('ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" SET NOT NULL');
    try {
      const out = await purgeDueUsers();
      expect(out.failedCount, 'the un-migrated column must make the purge fail').toBe(1);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" DROP NOT NULL');
    }
  });

  test.afterAll(async () => {
    await prisma.systemAlert.deleteMany({
      where: {
        source: 'users-scheduled-deletion',
        meta: { path: ['failedUserIds'], array_contains: [ids.subject] },
      },
    });
    await prisma.auditEvent.deleteMany({
      where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } },
    });
    await prisma.relationship.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.tenant.deleteMany({ where: { id: ids.tenant } });
    await prisma.user.deleteMany({ where: { id: ids.subject } });
    await prisma.$disconnect();
  });

  test('a platform admin sees the failed erasure on /admin/alerts', async ({ page }) => {
    test.skip(skipReason !== '', skipReason);

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    const target = '/tr/admin/alerts';
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${target}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // The row the failed erasure wrote.
    const message = page
      .getByText('Scheduled erasure did not complete for every due account')
      .first();
    await expect(message).toBeVisible();
    // Scoped to the table: the same string also exists as an <option> in the
    // source filter (hidden), and matching that would prove only that the
    // filter was built, not that the row is on screen.
    await expect(
      page.locator('table td', { hasText: 'users-scheduled-deletion' }).first(),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-alerts-console.png`, fullPage: true });

    // The ids live in `meta`, which the console shows when the operator opens
    // the row — so opening it is part of the workflow being proved.
    await message.click();
    await expect(page.getByText(ids.subject, { exact: false }).first()).toBeVisible();
    await expect(page.getByText('P2011', { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/07-alert-detail.png`, fullPage: true });

    // The alarm may not carry the erased person's e-mail address.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('@qa.invalid');
  });
});

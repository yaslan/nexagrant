import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import {
  sweepOrphanTenantAlerts,
  type AlertsSweepDb,
} from '../../src/lib/jobs/tasks/alerts-sweep';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTVRC1UGA3B6Y — a failing sweep must reach the operator's screen.
 *
 * Baseline, measured before the fix: every failure returned
 * `{ success: false, scanned: 0, closed: 0 }`, wrote one `console.error` line
 * and nothing else. `step.run` does not read `success`, so Inngest marked the
 * run SUCCEEDED and `SystemAlert` held zero rows from this job. A daily cron
 * could have been dead for months with no surface saying so.
 *
 * The fault injected here is a REAL `PrismaClientValidationError` from the real
 * driver — the sweep's candidate query is asked for a column `SystemAlert` does
 * not have — rather than a thrown literal. It is the same bug class that killed
 * `alerts-daily` (`include: { tenant: true }` on a model with no relation), and
 * the class a mocked client cannot catch. Every other call goes to the real
 * database, so the rows this spec reads back were written by production code.
 *
 * Three failures, threshold 3: the console must show ONE folded `info` row
 * carrying ×3 and ONE `error` row — not three rows, and not silence.
 *
 * LOCAL DEV DATABASE ONLY: `beforeAll`/`afterAll` delete this job's own health
 * rows (`source = 'alerts-sweep'`), which nothing else writes.
 */

const SHOTS = shotsDir('TASK-MTVRC1UGA3B6Y-screenshots');
const ADMIN_EMAIL = 'admin@yasinaslan.com.tr';
// The seeded platform-admin seat behind ADMIN_EMAIL (prisma/seed-tenant-workspace.ts,
// `isPlatformAdmin: true`). The demo sign-in form that used to resolve the address to
// it does not exist in a production build, so the session is a minted cookie for the
// same user (TASK-MUSBCXP9RKS3D); the jwt callback still reads the admin flag from the row.
const ADMIN_SEAT = { id: 'demo-user-superadmin', email: ADMIN_EMAIL, tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const THRESHOLD = 3;
const HEALTH_SOURCE = 'alerts-sweep';
const STREAK_KEY = 'alerts-sweep:run-failed';

let skipReason = '';
let streakRowId = '';

/** The real client with only the sweep's own candidate query broken. */
function brokenScanDb(): AlertsSweepDb {
  return {
    systemAlert: {
      findMany: async (args: unknown) => {
        const a = args as { where?: { createdAt?: unknown } };
        if (a.where?.createdAt) {
          return prisma.systemAlert.findMany({
            ...(a as object),
            select: { id: true, meta: true, tenantId: true },
          } as never);
        }
        return prisma.systemAlert.findMany(args as never);
      },
      update: async (args: unknown) => prisma.systemAlert.update(args as never),
      create: async (args: unknown) => prisma.systemAlert.create(args as never),
    },
    tenant: { findMany: async (args: unknown) => prisma.tenant.findMany(args as never) },
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('a repeatedly failing alerts sweep reaches the alerts console', () => {
  test.beforeAll(async () => {
    if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
      skipReason = `no platform admin ${ADMIN_EMAIL} in this database`;
      return;
    }

    await prisma.systemAlert.deleteMany({ where: { source: HEALTH_SOURCE } });

    const db = brokenScanDb();
    for (let run = 1; run <= THRESHOLD; run++) {
      const out = await sweepOrphanTenantAlerts(db, new Date(), { threshold: THRESHOLD });
      expect(out.success, 'the injected fault must actually fail the run').toBe(false);
    }

    const rows = await prisma.systemAlert.findMany({
      where: { source: HEALTH_SOURCE },
      select: { id: true, level: true, meta: true },
    });
    // Three failures, two rows: the streak folded. This is the assertion that
    // fails if `dedupeKey` ever stops being stable.
    expect(rows, 'three failures must fold into one info row plus one escalation').toHaveLength(2);
    const streak = rows.find(
      (r) => (r.meta as Record<string, unknown>).alertDedupeKey === STREAK_KEY
    );
    expect(streak?.level).toBe('info');
    streakRowId = streak?.id ?? '';
  });

  test.afterAll(async () => {
    await prisma.systemAlert.deleteMany({ where: { source: HEALTH_SOURCE } });
    await prisma.$disconnect();
  });

  test('a platform admin sees one folded ×3 breadcrumb and one error alert', async ({ page }) => {
    test.skip(skipReason !== '', skipReason);

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true })
      );
    });

    const target = '/tr/admin/alerts';
    await signInAs(page, ADMIN_SEAT);
    await page.goto(target);
    await page.waitForURL(`**${target}`, { timeout: 30_000 });

    // Scoped to the table body: the source name also exists as an <option> in
    // the filter, and matching that would prove the filter was built, not that
    // the rows are on screen.
    const sweepCells = page.locator('table td', { hasText: HEALTH_SOURCE });
    await expect(sweepCells).toHaveCount(2);

    await expect(
      page.getByText('Orphan-alert sweep has failed 3 or more consecutive runs').first()
    ).toBeVisible();

    // The whole point of the threshold plus a stable key: one row standing for
    // three runs, not three rows.
    const badge = page.getByTestId(`alert-repeat-${streakRowId}`);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/×3/);

    await page.screenshot({ path: `${SHOTS}/01-alerts-console.png`, fullPage: true });

    // `meta` is behind the row, so opening it is part of the operator workflow
    // this alert is supposed to support.
    const failedRow = page.getByText('Orphan-alert sweep did not complete', { exact: false }).first();
    await expectHydrated(failedRow);
    await failedRow.click();
    await expect(page.getByText('"stage"', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('PrismaClientValidationError', { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-alert-detail.png`, fullPage: true });

    // `SystemAlert` has no RLS policy and a driver error can carry the
    // connection string, so only the error's class may reach the row.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Unknown field');
    expect(body).not.toContain('postgresql://');
  });
});

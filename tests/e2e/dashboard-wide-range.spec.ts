import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-72 (TASK-MVCU7MP8JK1V5) — a multi-decade custom range on the panel. The trend used to run
 * three counts per week inside the page's 5 s transaction; a range like this one expired it
 * and the whole panel showed "could not load data" instead of the KPIs.
 */

const SHOTS = shotsDir('TASK-MVCU7MP8JK1V5-screenshots');
const MANAGER = {
  userId: 'e2e-wide-range-manager',
  email: 'wide-range-manager@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: 'demo-tenant',
};

const today = new Date().toISOString().slice(0, 10);

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

test.beforeAll(async () => {
  await seedIdentity({ ...MANAGER, workspaceIds: [] });
});

test.afterAll(async () => {
  await cleanupIdentity([MANAGER.userId]);
  await prisma.$disconnect();
});

test('a range reaching back to 2000 loads the panel, not the load-error notice', async ({ page }) => {
  await acceptCookies(page);
  await signInAs(page, { id: MANAGER.userId, email: MANAGER.email, tenantId: MANAGER.tenantId, role: MANAGER.role });
  await page.goto(`/tr/main/panel?from=2000-01-01&to=${today}`);

  await expect(page.locator('#dashboard-panel-overview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Veri Yüklenemedi')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/01-tr-panel-2000-today.png`, fullPage: true });
});

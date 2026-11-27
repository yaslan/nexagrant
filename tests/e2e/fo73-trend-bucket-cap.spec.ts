import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * TASK-MVCW3ANV1JU6Y (FO-73) — the dashboard trend over a hand-edited
 * `?from=1000-01-01`.
 *
 * That is a valid date, and at a week per bucket it was ~53,000 buckets: the
 * query stayed fast, but ~106,000 points went into the page payload and the
 * chart. The claim pinned here is what the browser receives: at most 120 points
 * per metric, and the chart still draws the tenant's opportunity.
 */

const SHOTS = shotsDir('TASK-MVCW3ANV1JU6Y-screenshots');
const RUN = `fo73-e2e-${Date.now()}`;

const F = {
  tenantId: `${RUN}-tenant`,
  workspaceId: `${RUN}-ws`,
  userId: `${RUN}-user`,
  email: `${RUN}@fabrika.test`,
};

const DASHBOARD_URL = `/tr/${RUN}-ws-slug/dashboard?from=1000-01-01&to=2026-09-06`;

test.beforeAll(async () => {
  await prisma.tenant.create({
    data: { id: F.tenantId, name: `Tenant ${RUN}`, slug: `${RUN}-tenant`, country: 'TR', orgType: 'SME' },
  });
  await prisma.user.create({ data: { id: F.userId, email: F.email, name: 'Trend Cap' } });
  await prisma.membership.create({ data: { tenantId: F.tenantId, userId: F.userId, role: 'TENANT_OWNER' } });
  await prisma.workspace.create({
    data: { id: F.workspaceId, tenantId: F.tenantId, name: 'FO73 Workspace', slug: `${RUN}-ws-slug` },
  });
  await prisma.moduleState.create({ data: { tenantId: F.tenantId, moduleId: 'M5', status: 'ON' } });
  await prisma.opportunity.create({
    data: {
      tenantId: F.tenantId,
      workspaceId: F.workspaceId,
      title: `Trend cap ${RUN}`,
      stage: 'G0',
      status: 'ACTIVE',
      ownerId: F.userId,
      createdAt: new Date('2025-06-01T10:00:00Z'),
    },
  });
});

test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.membership.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.workspace.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.user.deleteMany({ where: { id: F.userId } });
  await prisma.tenant.deleteMany({ where: { id: F.tenantId } });
  await prisma.$disconnect();
});

test('a year-1000 range sends at most 120 trend points and the chart still draws', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
  await signInAs(page, { id: F.userId, email: F.email, tenantId: F.tenantId, role: 'TENANT_OWNER' });

  const res = await page.goto(DASHBOARD_URL);
  expect(res?.ok()).toBe(true);
  const html = (await res?.text()) ?? '';
  // The trend travels in the RSC payload, JSON-escaped inside a script tag.
  const offerPoints = html.match(/metric\\*":\\*"offers/g)?.length ?? 0;
  expect(offerPoints).toBeGreaterThan(0);
  expect(offerPoints).toBeLessThanOrEqual(120);

  const trendsTab = page.getByRole('tab', { name: 'Eğilimler' });
  await expectHydrated(trendsTab);
  await trendsTab.click();
  const panel = page.locator('#dashboard-panel-trends');
  await expect(panel.getByRole('heading', { name: 'Teklifler ve İsabet Oranı' })).toBeVisible();
  await expect(panel.locator('.recharts-line-curve').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/trend-year-1000.png`, fullPage: true });

  console.log(`[fo73] offer points=${offerPoints} html bytes=${html.length}`);
});

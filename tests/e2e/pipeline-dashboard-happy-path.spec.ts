import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';

/**
 * TASK-MTVR9T834EPUC — the browser half of the tenant-bypass slice 2 evidence.
 *
 * The unit probe (tests/pipeline-surface-tenant-scope.live.test.ts) measures the
 * guarantee, over the RLS role. This spec measures the thing that guarantee is
 * not allowed to cost: the pipeline board and the dashboard still work, in a
 * real browser, with real clicks, after seven files moved their queries into
 * `withTenant` transactions.
 *
 * It is a regression net for the specific way a wrapper migration goes wrong —
 * a query that now runs inside a transaction and quietly returns nothing, or an
 * action whose write no longer lands. So the assertions are on what the user
 * sees (the card is on the board, the owner changed, the KPI export carries the
 * tenant's real counts), and the write is read back out of Postgres afterwards.
 */

const SHOTS = shotsDir('TASK-MTVR9T834EPUC-screenshots');
const RUN = `tvr9t8-e2e-${Date.now()}`;

const F = {
  tenantId: `${RUN}-tenant`,
  workspaceId: `${RUN}-ws`,
  userId: `${RUN}-user`,
  email: `${RUN}@fabrika.test`,
  secondUserId: `${RUN}-user2`,
  secondEmail: `${RUN}-2@fabrika.test`,
  secondName: `Second Owner ${RUN}`,
  oppId: `${RUN}-opp`,
  oppTitle: `Pipeline happy path ${RUN}`,
};

const BOARD_URL = `/tr/${RUN}-ws-slug/pipeline`;

test.beforeAll(async () => {
  await prisma.tenant.create({
    data: { id: F.tenantId, name: `Tenant ${RUN}`, slug: `${RUN}-tenant`, country: 'TR', orgType: 'SME' },
  });
  await prisma.user.create({ data: { id: F.userId, email: F.email, name: 'Happy Path' } });
  // A second member so the owner dropdown has somewhere to move the card to.
  await prisma.user.create({
    data: { id: F.secondUserId, email: F.secondEmail, name: F.secondName },
  });
  await prisma.membership.createMany({
    data: [
      { tenantId: F.tenantId, userId: F.userId, role: 'TENANT_OWNER' },
      { tenantId: F.tenantId, userId: F.secondUserId, role: 'PIPELINE_MANAGER' },
    ],
  });
  await prisma.workspace.create({
    data: { id: F.workspaceId, tenantId: F.tenantId, name: 'HP Workspace', slug: `${RUN}-ws-slug` },
  });
  // M5 is the pipeline module; the board is gated on it being ON.
  await prisma.moduleState.create({
    data: { tenantId: F.tenantId, moduleId: 'M5', status: 'ON' },
  });
  await prisma.opportunity.create({
    data: {
      id: F.oppId,
      tenantId: F.tenantId,
      workspaceId: F.workspaceId,
      title: F.oppTitle,
      stage: 'G0',
      status: 'ACTIVE',
      ownerId: F.userId,
    },
  });
});

test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.membership.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.workspace.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [F.userId, F.secondUserId] } } });
  await prisma.tenant.deleteMany({ where: { id: F.tenantId } });
  await prisma.$disconnect();
});

/** The consent dialog is `inset-0` and swallows every click. */
async function signIn(page: Page, target: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]:visible').first().fill(F.email);
  await page.locator('form button[type="submit"]:visible').first().click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
  // Callers assert on a locator next, and hydrate what they click (fixtures/hydration.ts).
}

test('the board loads a wrapped query and a wrapped action still writes', async ({ page }) => {
  await signIn(page, BOARD_URL);

  // 1. The read path: `pipeline/page.tsx` lists the tenant's opportunities.
  //    A wrapper migration that broke the query would land here as an empty board.
  const card = page.getByTestId(`pipeline-card-${F.oppId}`);
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: F.oppTitle })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-pipeline-board-loaded.png`, fullPage: true });

  // 2. The write path: `assignOpportunityOwner` is one of the five calls this
  //    slice wrapped. Driven by a real selection on the card's owner dropdown,
  //    which is the only place the product offers it.
  const cardHeading = card.getByRole('heading', { name: F.oppTitle });
  await expectHydrated(cardHeading);
  await cardHeading.click();

  const ownerSelect = card.locator('select[title="Sorumlu kullanıcıyı değiştir"]');
  await expect(ownerSelect).toBeVisible();
  await ownerSelect.selectOption(F.secondUserId);

  // 3. Read the row back out of Postgres, not out of the screen: the optimistic
  //    in-memory buffer would keep the card looking right even if the wrapped
  //    `updateMany` never reached the database.
  await expect
    .poll(
      async () => {
        const row = await prisma.opportunity.findUnique({
          where: { id: F.oppId },
          select: { ownerId: true },
        });
        return row?.ownerId;
      },
      { timeout: 15_000, message: 'the wrapped updateMany never landed the new owner' },
    )
    .toBe(F.secondUserId);

  await page.screenshot({ path: `${SHOTS}/02-owner-assigned.png`, fullPage: true });
});

test('the KPI export reports the rows the wrapped loader returned', async ({ page }) => {
  // `fetchDashboardMetrics` — the file whose two calls this slice wrapped — is
  // reached from exactly one place in the product: this CSV export. Driving the
  // dashboard *page* would prove nothing about it, because that screen is served
  // by `getKpiMetrics` in src/modules/m5/server/queries.ts instead.
  await signIn(page, BOARD_URL);

  const res = await page.request.get('/api/dashboard/export-csv');
  expect(res.status()).toBe(200);
  const csv = await res.text();

  // The failure mode being guarded is a loader that returns an empty result set
  // inside its new transaction, which reaches the file as a confident page of
  // zeroes. The seeded tenant holds exactly one opportunity, at G2, with one
  // module ON, still at the G0 it was seeded at — so these are known numbers,
  // not "whatever the export says".
  expect(csv).toMatch(/^Toplam Teklif,1,adet/m);
  expect(csv).toContain('Açık Modüller,1,modül');
  expect(csv).toMatch(/^G0,1\r?$/m);

  writeFileSync(`${SHOTS}/03-kpi-export.csv`, csv, 'utf8');
});

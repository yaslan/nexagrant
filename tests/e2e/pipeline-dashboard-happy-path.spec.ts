import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

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
// Date.now() alone collides between parallel workers: same ids, a Tenant_pkey failure in one,
// and its afterAll deleting the other's tenant (measured with --workers=2, FO-336).
const RUN = `tvr9t8-e2e-${Date.now()}-${randomUUID().slice(0, 8)}`;

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
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
  // A cookie for the owner beforeAll created: the demo sign-in form does not exist in
  // a production build (TASK-MUSBCXP9RKS3D).
  await signInAs(page, { id: F.userId, email: F.email, tenantId: F.tenantId, role: 'TENANT_OWNER' });
  await page.goto(target);
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
  //    The members come from an effect after mount, and the dropdown is empty until
  //    they do, so their arrival in the toolbar's owner filter is the board's ready
  //    signal. Same budget as expectHydrated: a cold dev server compiles the action.
  const cardHeading = card.getByRole('heading', { name: F.oppTitle });
  await expectHydrated(cardHeading);
  await expect(page.locator(`option[value="${F.secondUserId}"]`).first()).toBeAttached({
    timeout: 30_000,
  });
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

test('the board does not move when the members arrive', async ({ page }) => {
  // FO-336. The owner filter used to grow with its longest name, wrap the toolbar and drop
  // the board 56 px. Arriving between a press and its release, that took the card title out
  // from under the pointer: the browser sent the click to a common ancestor, the title's
  // onClick never ran, and nothing reported it. Playwright checks its target on the first
  // pointer event only, so it does not retry either.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${BOARD_URL}`, async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  try {
    await signIn(page, BOARD_URL);
    const heading = page.getByTestId(`pipeline-card-${F.oppId}`).getByRole('heading', { name: F.oppTitle });
    await expectHydrated(heading);
    const before = await heading.boundingBox();

    // The members are still held back: without this, a route that stopped holding the POST
    // would let the test pass without ever moving the board (PR #253 review, suggestion 1).
    await expect(page.locator(`option[value="${F.secondUserId}"]`)).toHaveCount(0);

    release();
    await expect(page.locator(`option[value="${F.secondUserId}"]`).first()).toBeAttached({
      timeout: 30_000,
    });

    expect(await heading.boundingBox()).toEqual(before);
  } finally {
    // Idempotent: a failure before the release above must not leave the route hanging.
    release();
  }
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

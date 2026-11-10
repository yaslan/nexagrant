import { test, expect, type Page } from '@playwright/test';
import type { Gate } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

// NG-100 / K-579560=A: a seat candidate counts only when the M8 matcher wrote its row
// (visibleSeatCandidates reads the breakdown), so the seeded backup carries a matcher breakdown.
const MATCH_BREAKDOWN = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };

/**
 * NG-26: the two doors NG-25 left open, measured the way a user (or a tampered client) goes through them.
 *
 * A stage records a gate already passed, so a new opportunity starts at G0 and G1 asks for a passed
 * G0. The board really drags and clicks, the tampered create really leaves the browser, and every
 * verdict is read from Postgres.
 *
 * PIPELINE_GATE_HOLES_KEEP=1 leaves the rows in place for inspection after a run.
 */

const TENANT = 'gate-holes-e2e-tenant';
const WORKSPACE = 'gate-holes-e2e-workspace';
const SLUG = 'gate-holes-e2e';
const USER = 'gate-holes-e2e-user';
const EMAIL = 'gate-holes-e2e@fabrika.test';
const FIXTURE = 'gate-holes-e2e-fixture';
const SHOTS = shotsDir('NG-26-screenshots');

const CREATED_TITLE = 'gate-holes G0 form opportunity';
const TAMPERED_TITLE = 'gate-holes tampered G4 opportunity';

const OPP = {
  boardNoG0: 'gate-holes-board-no-g0',
  boardFailedG0: 'gate-holes-board-failed-g0',
  boardReady: 'gate-holes-board-ready',
  detailNoG0: 'gate-holes-detail-no-g0',
  detailReady: 'gate-holes-detail-ready',
  detailNoEvidence: 'gate-holes-detail-no-evidence',
  enBoardNoG0: 'gate-holes-en-board-no-g0',
  enDetailNoG0: 'gate-holes-en-detail-no-g0',
} as const;
const OPP_IDS = Object.values(OPP);

/** G0 decisions on file, oldest first. An opportunity not listed has none. */
const G0_ON_FILE: Partial<Record<string, boolean[]>> = {
  [OPP.boardFailedG0]: [true, false],
  [OPP.boardReady]: [false, true],
  [OPP.detailReady]: [true],
};
const WITH_SEATS = [OPP.boardNoG0, OPP.boardFailedG0, OPP.boardReady, OPP.detailNoG0, OPP.detailReady];

async function rollback() {
  await prisma.seatCandidate.deleteMany({ where: { tenantId: TENANT } });
  await prisma.consortiumSeat.deleteMany({ where: { tenantId: TENANT } });
  await prisma.gateDecision.deleteMany({ where: { tenantId: TENANT } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TENANT } });
  await prisma.opportunity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.membership.deleteMany({ where: { tenantId: TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: TENANT } });
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.workspace.deleteMany({ where: { id: WORKSPACE } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
}

async function seed() {
  await rollback();
  await prisma.tenant.create({
    data: { id: TENANT, name: 'Gate holes e2e', slug: SLUG, country: 'TR', kind: 'ORGANIZATION' },
  });
  await prisma.workspace.create({ data: { id: WORKSPACE, tenantId: TENANT, name: 'Gate holes', slug: SLUG } });
  await prisma.user.create({ data: { id: USER, email: EMAIL, name: 'Gate Holes Owner', locale: 'tr' } });
  await prisma.membership.create({
    data: { userId: USER, tenantId: TENANT, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE] },
  });
  await prisma.moduleState.create({ data: { tenantId: TENANT, moduleId: 'M5', status: 'ON', changedBy: 'gate-holes-e2e' } });

  for (const id of OPP_IDS) {
    await prisma.opportunity.create({ data: { id, tenantId: TENANT, workspaceId: WORKSPACE, title: id, stage: 'G0' } });
  }
  for (const [id, outcomes] of Object.entries(G0_ON_FILE)) {
    for (const [i, passed] of (outcomes ?? []).entries()) {
      await prisma.gateDecision.create({
        data: {
          tenantId: TENANT,
          opportunityId: id,
          gate: 'G0',
          passed,
          inputs: {},
          ruleVersion: '1.0',
          decidedBy: FIXTURE,
          decidedAt: new Date(Date.now() - (outcomes!.length - i) * 3_600_000),
        },
      });
    }
  }
  // Every other G1 condition is met, so G0 is the only thing these can be refused for.
  for (const id of WITH_SEATS) {
    const seat = await prisma.consortiumSeat.create({
      data: { tenantId: TENANT, opportunityId: id, roleKey: 'research', status: 'CONFIRMED', organizationId: `${id}-org` },
    });
    await prisma.seatCandidate.create({
      data: { tenantId: TENANT, seatId: seat.id, organizationId: `${id}-backup`, score: 9, breakdown: MATCH_BREAKDOWN, rank: 1 },
    });
  }
}

const stageOf = async (id: string) =>
  (await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage;
const decisionsOf = (id: string) =>
  prisma.gateDecision.findMany({
    where: { opportunityId: id },
    orderBy: { decidedAt: 'asc' },
    select: { gate: true, passed: true, decidedBy: true },
  });

async function openBoard(page: Page, locale: 'tr' | 'en' = 'tr') {
  await signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });
  // The board loads its members from an effect, so this POST also says React has hydrated.
  const hydrated = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/pipeline'),
    { timeout: 60_000 },
  );
  await page.goto(`/${locale}/${SLUG}/pipeline`);
  await hydrated;
  await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });
}

async function openDetail(page: Page, id: string, locale: 'tr' | 'en' = 'tr') {
  await signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });
  await page.goto(`/${locale}/${SLUG}/pipeline/${id}`);
  const main = page.locator('main');
  await expect(main.getByTestId('pipeline-evaluate-gate')).toBeVisible({ timeout: 30_000 });
  return main;
}

const drag = (page: Page, id: string, to: Gate) =>
  page.getByTestId(`pipeline-card-${id}`).dragTo(page.getByTestId(`pipeline-column-${to}`));
const card = (page: Page, column: Gate, id: string) =>
  page.getByTestId(`pipeline-column-${column}`).getByTestId(`pipeline-card-${id}`);

test.describe.configure({ mode: 'serial' });

// Tall enough that every card and column fit without scrolling; see stage-move-gate.spec.ts.
test.use({ viewport: { width: 1440, height: 2400 } });

// File level: the three blocks below share one fixture.
test.beforeAll(seed);

test.afterAll(async () => {
  if (process.env.PIPELINE_GATE_HOLES_KEEP !== '1') await rollback();
  await prisma.$disconnect();
});

test.describe('NG-26: a new opportunity starts at G0', () => {
  test('only G0 offers a + button, and an empty later column offers nothing to click', async ({ page }) => {
    await openBoard(page);

    await expect(page.getByTestId('pipeline-add-G0')).toBeVisible();
    for (const gate of ['G1', 'G2', 'G3', 'G4'] as const) {
      await expect(page.getByTestId(`pipeline-add-${gate}`)).toHaveCount(0);
      const empty = page.getByTestId(`pipeline-empty-${gate}`);
      await expect(empty).toBeVisible();
      await expect(empty).not.toContainText('ekleyin');
      await empty.click();
      await expect(page.getByTestId('pipeline-create-form')).toHaveCount(0);
    }
    await page.screenshot({ path: `${SHOTS}/NG-26-01-board-plus-only-g0.png`, fullPage: true });
  });

  test('the form picks no stage, and what it opens is at G0 in the database', async ({ page }) => {
    await openBoard(page);

    await page.getByTestId('pipeline-add-G0').click();
    const form = page.getByTestId('pipeline-create-form');
    await expect(form).toBeVisible();
    await expect(form.getByText('Başlangıç Kapısı')).toHaveCount(0);
    await expect(form.locator('option[value="G4"]')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/NG-26-02-form-no-stage.png`, fullPage: true });

    await form.getByTestId('pipeline-create-title').fill(CREATED_TITLE);
    await form.locator('button[type="submit"]').click();

    const row = page.getByTestId('pipeline-column-G0').getByText(CREATED_TITLE);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const rows = await prisma.opportunity.findMany({ where: { tenantId: TENANT, title: CREATED_TITLE }, select: { stage: true } });
    expect(rows).toEqual([{ stage: 'G0' }]);
  });

  test('a tampered client asking the server action for G4: refused, nothing is created', async ({ page }) => {
    await openBoard(page);

    // The action's real request, with the field the old client sent put back on the way out.
    let tampered = false;
    let actionStatus = 0;
    await page.route(`**/${SLUG}/pipeline`, async (route) => {
      const body = route.request().postData() ?? '';
      if (route.request().method() !== 'POST' || !body.includes(TAMPERED_TITLE)) return route.continue();
      const args = JSON.parse(body) as Record<string, unknown>[];
      args[0]!.stage = 'G4';
      tampered = true;
      const response = await route.fetch({ postData: JSON.stringify(args) });
      actionStatus = response.status();
      await route.fulfill({ response });
    });

    await page.getByTestId('pipeline-add-G0').click();
    const form = page.getByTestId('pipeline-create-form');
    await form.getByTestId('pipeline-create-title').fill(TAMPERED_TITLE);
    await form.locator('button[type="submit"]').click();

    await expect(page.getByText('Fırsat oluşturulamadı')).toBeVisible({ timeout: 30_000 });
    expect(tampered).toBe(true);
    expect(actionStatus).toBe(200);
    await page.screenshot({ path: `${SHOTS}/NG-26-03-tampered-g4-refused.png`, fullPage: true });

    expect(await prisma.opportunity.count({ where: { tenantId: TENANT, title: TAMPERED_TITLE } })).toBe(0);
    expect(await prisma.opportunity.count({ where: { tenantId: TENANT, stage: 'G4' } })).toBe(0);
  });
});

test.describe('NG-26: G1 asks for a passed G0', () => {
  test('board, no G0 decision: refused, the reason is in Turkish, the stage is unchanged', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardNoG0, 'G1');

    const refused = page.getByTestId('pipeline-move-refused');
    await expect(refused).toBeVisible({ timeout: 30_000 });
    await expect(refused).toContainText('G0 kapısı henüz geçilmedi');
    await expect(refused).not.toContainText('has not been passed');
    await expect(card(page, 'G0', OPP.boardNoG0)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/NG-26-04-board-no-g0-refused-tr.png`, fullPage: true });

    expect(await stageOf(OPP.boardNoG0)).toBe('G0');
    expect(await decisionsOf(OPP.boardNoG0)).toEqual([{ gate: 'G1', passed: false, decidedBy: USER }]);
  });

  test('board, the latest G0 decision failed: refused although an older one passed', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardFailedG0, 'G1');

    const refused = page.getByTestId('pipeline-move-refused');
    await expect(refused).toContainText('son kararı', { timeout: 30_000 });
    expect(await stageOf(OPP.boardFailedG0)).toBe('G0');
  });

  test('board, G0 passed and the conditions met: advances and files the decision', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardReady, 'G1');

    await expect(card(page, 'G1', OPP.boardReady)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pipeline-move-refused')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/NG-26-05-board-ready-advanced.png`, fullPage: true });

    expect(await stageOf(OPP.boardReady)).toBe('G1');
    expect(await decisionsOf(OPP.boardReady)).toEqual([
      { gate: 'G0', passed: false, decidedBy: FIXTURE },
      { gate: 'G0', passed: true, decidedBy: FIXTURE },
      { gate: 'G1', passed: true, decidedBy: USER },
    ]);
  });

  test('detail button, no G0 decision: refused, the reason is in Turkish, the stage is unchanged', async ({ page }) => {
    const main = await openDetail(page, OPP.detailNoG0);

    await main.getByTestId('pipeline-evaluate-gate').click();

    const result = main.getByTestId('pipeline-gate-result');
    await expect(result).toContainText('G0 kapısı henüz geçilmedi', { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/NG-26-06-detail-no-g0-refused-tr.png`, fullPage: true });

    expect(await stageOf(OPP.detailNoG0)).toBe('G0');
    expect(await decisionsOf(OPP.detailNoG0)).toEqual([{ gate: 'G1', passed: false, decidedBy: USER }]);
  });

  test('detail button, G0 passed and the conditions met: advances and files the decision', async ({ page }) => {
    const main = await openDetail(page, OPP.detailReady);

    await main.getByTestId('pipeline-evaluate-gate').click();

    await expect(main.getByTestId('pipeline-gate-result')).toContainText('G1 kapısı geçildi', { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/NG-26-07-detail-ready-advanced.png`, fullPage: true });

    expect(await stageOf(OPP.detailReady)).toBe('G1');
    expect(await decisionsOf(OPP.detailReady)).toEqual([
      { gate: 'G0', passed: true, decidedBy: FIXTURE },
      { gate: 'G1', passed: true, decidedBy: USER },
    ]);
  });
});

test.describe('NG-26: the reasons read in the language of the screen', () => {
  test('the G0 gate on the detail screen, Turkish: no evidence, in the banner and the score panel', async ({ page }) => {
    const main = await openDetail(page, OPP.detailNoEvidence);

    await main.getByTestId('pipeline-evaluate-current-gate').click();

    const result = main.getByTestId('pipeline-gate-result');
    await expect(result).toContainText('G0 puanı hesaplanamadı', { timeout: 30_000 });
    await expect(main).not.toContainText('no scoring evidence');
    await page.screenshot({ path: `${SHOTS}/NG-26-08-detail-g0-reason-tr.png`, fullPage: true });
  });

  test('board, English', async ({ page }) => {
    await openBoard(page, 'en');

    await drag(page, OPP.enBoardNoG0, 'G1');

    const refused = page.getByTestId('pipeline-move-refused');
    await expect(refused).toContainText('G0 has not been passed', { timeout: 30_000 });
    await expect(refused).toContainText('no critical role');
    await expect(refused).not.toContainText('henüz');
    await page.screenshot({ path: `${SHOTS}/NG-26-09-board-reason-en.png`, fullPage: true });

    expect(await stageOf(OPP.enBoardNoG0)).toBe('G0');
  });

  test('detail button, English', async ({ page }) => {
    const main = await openDetail(page, OPP.enDetailNoG0, 'en');

    await main.getByTestId('pipeline-evaluate-gate').click();

    const result = main.getByTestId('pipeline-gate-result');
    await expect(result).toContainText('G0 has not been passed', { timeout: 30_000 });
    await expect(result).not.toContainText('henüz');
    await page.screenshot({ path: `${SHOTS}/NG-26-10-detail-reason-en.png`, fullPage: true });

    expect(await stageOf(OPP.enDetailNoG0)).toBe('G0');
  });
});

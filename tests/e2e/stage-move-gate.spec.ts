import { test, expect, type Page } from '@playwright/test';
import type { Gate } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import { presentIds } from '../helpers/teardown-guard';

// NG-100 / K-579560=A: a seat candidate counts only when the M8 matcher wrote its row
// (visibleSeatCandidates reads the breakdown), so the seeded backup carries a matcher breakdown.
const MATCH_BREAKDOWN = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };

/**
 * NG-25: a forward stage move goes through the gate, measured the way a user makes it.
 *
 * The board really drags (`dragTo`, HTML5 drag and drop in Chromium) and the detail screen really
 * clicks; every verdict is then read from Postgres. The board used to move any card anywhere and
 * the detail button ran the gate the opportunity had already passed, so neither door was a gate.
 *
 * STAGE_MOVE_E2E_KEEP=1 leaves the rows in place for inspection after a run.
 */

const TENANT = 'stage-move-e2e-tenant';
const WORKSPACE = 'stage-move-e2e-workspace';
const SLUG = 'stage-move-e2e';
const USER = 'stage-move-e2e-user';
const EMAIL = 'stage-move-e2e@fabrika.test';
const FIXTURE = 'stage-move-e2e-fixture';
const SHOTS = shotsDir('NG-25-screenshots');

const OPP = {
  boardBlocked: 'stage-move-board-blocked',
  boardReady: 'stage-move-board-ready',
  boardSkip: 'stage-move-board-skip',
  boardBack: 'stage-move-board-back',
  detailBlocked: 'stage-move-detail-blocked',
  detailReady: 'stage-move-detail-ready',
  detailLast: 'stage-move-detail-last',
} as const;
const OPP_IDS = Object.values(OPP);

const STARTING_STAGE: Record<string, Gate> = { [OPP.boardBack]: 'G2', [OPP.detailLast]: 'G4' };

async function rollback() {
  await prisma.seatCandidate.deleteMany({ where: { tenantId: TENANT } });
  await prisma.consortiumSeat.deleteMany({ where: { tenantId: TENANT } });
  await prisma.gateDecision.deleteMany({ where: { opportunityId: { in: presentIds(OPP_IDS) } } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TENANT } });
  await prisma.opportunity.deleteMany({ where: { id: { in: presentIds(OPP_IDS) } } });
  await prisma.membership.deleteMany({ where: { tenantId: TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: TENANT } });
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.workspace.deleteMany({ where: { id: WORKSPACE } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
}

async function seed() {
  await rollback();
  await prisma.tenant.create({
    data: { id: TENANT, name: 'Stage move e2e', slug: SLUG, country: 'TR', kind: 'ORGANIZATION' },
  });
  await prisma.workspace.create({ data: { id: WORKSPACE, tenantId: TENANT, name: 'Stage move', slug: SLUG } });
  await prisma.user.create({ data: { id: USER, email: EMAIL, name: 'Stage Move Owner', locale: 'tr' } });
  await prisma.membership.create({
    data: { userId: USER, tenantId: TENANT, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE] },
  });
  await prisma.moduleState.create({ data: { tenantId: TENANT, moduleId: 'M5', status: 'ON', changedBy: 'stage-move-e2e' } });

  for (const id of OPP_IDS) {
    await prisma.opportunity.create({
      data: { id, tenantId: TENANT, workspaceId: WORKSPACE, title: id, stage: STARTING_STAGE[id] ?? 'G0' },
    });
  }
  // The real G1 conditions: G0 passed, a filled critical seat and a backup candidate.
  for (const id of [OPP.boardReady, OPP.detailReady]) {
    await prisma.gateDecision.create({
      data: { tenantId: TENANT, opportunityId: id, gate: 'G0', passed: true, inputs: {}, ruleVersion: '1.0', decidedBy: FIXTURE },
    });
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

async function openBoard(page: Page) {
  await signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });
  // The board loads its members from an effect, so this POST also says React has hydrated:
  // before that a card drags with no `dragstart` handler and the drop carries no id.
  const hydrated = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/pipeline'),
    { timeout: 60_000 },
  );
  await page.goto(`/tr/${SLUG}/pipeline`);
  await hydrated;
  await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });
}

/** Real pointer drag; the toast or the refusal panel is what says the server has answered. */
async function drag(page: Page, id: string, to: Gate) {
  await page.getByTestId(`pipeline-card-${id}`).dragTo(page.getByTestId(`pipeline-column-${to}`));
}

const card = (page: Page, column: Gate, id: string) =>
  page.getByTestId(`pipeline-column-${column}`).getByTestId(`pipeline-card-${id}`);

async function openDetail(page: Page, id: string) {
  await signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });
  await page.goto(`/tr/${SLUG}/pipeline/${id}`);
  const main = page.locator('main');
  await expect(main.getByTestId('pipeline-evaluate-gate')).toBeVisible({ timeout: 30_000 });
  return main;
}

test.describe.configure({ mode: 'serial' });

// Tall enough that every card and column fit without scrolling. `dragTo` scrolls the target into
// view between mouse-down and the first move, and Chromium then starts the drag on whichever card
// has slid under the pointer: the first run of this file dragged the wrong card that way.
test.use({ viewport: { width: 1440, height: 1600 } });

test.describe('NG-25: forward stage moves go through the gate', () => {
  test.beforeAll(seed);

  test.afterAll(async () => {
    if (process.env.STAGE_MOVE_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('board, conditions not met: refused, the card stays, the reason shows, the stage is unchanged', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardBlocked, 'G1');

    const refused = page.getByTestId('pipeline-move-refused');
    await expect(refused).toBeVisible({ timeout: 30_000 });
    await expect(refused).toContainText(OPP.boardBlocked);
    await expect(refused).toContainText('tanımlı kritik rol yok');
    await expect(card(page, 'G0', OPP.boardBlocked)).toBeVisible();
    await expect(card(page, 'G1', OPP.boardBlocked)).toHaveCount(0);
    await expect(page.getByText('aşamasına taşındı')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/NG-25-01-board-refused.png`, fullPage: true });

    expect(await stageOf(OPP.boardBlocked)).toBe('G0');
    expect(await decisionsOf(OPP.boardBlocked)).toEqual([{ gate: 'G1', passed: false, decidedBy: USER }]);

    // Still refused after a reload: the column reads the database, not client state.
    await page.reload();
    await expect(card(page, 'G0', OPP.boardBlocked)).toBeVisible({ timeout: 30_000 });
  });

  test('board, conditions met: the gate advances the card and files the decision', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardReady, 'G1');

    await expect(card(page, 'G1', OPP.boardReady)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Fırsat G1 aşamasına taşındı.')).toBeVisible();
    await expect(page.getByTestId('pipeline-move-refused')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/NG-25-02-board-advanced.png`, fullPage: true });

    expect(await stageOf(OPP.boardReady)).toBe('G1');
    expect(await decisionsOf(OPP.boardReady)).toEqual([
      { gate: 'G0', passed: true, decidedBy: FIXTURE },
      { gate: 'G1', passed: true, decidedBy: USER },
    ]);
  });

  test('board, skipping a stage: refused before any gate runs', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardSkip, 'G2');

    const refused = page.getByTestId('pipeline-move-refused');
    await expect(refused).toBeVisible({ timeout: 30_000 });
    await expect(refused).toContainText('önce G1 kapısı geçilmeli');
    await expect(card(page, 'G0', OPP.boardSkip)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/NG-25-03-board-skip-refused.png`, fullPage: true });

    expect(await stageOf(OPP.boardSkip)).toBe('G0');
    expect(await decisionsOf(OPP.boardSkip)).toEqual([]);
  });

  test('board, moving back: free, no gate decision', async ({ page }) => {
    await openBoard(page);

    await drag(page, OPP.boardBack, 'G0');

    await expect(card(page, 'G0', OPP.boardBack)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pipeline-move-refused')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/NG-25-04-board-back.png`, fullPage: true });

    expect(await stageOf(OPP.boardBack)).toBe('G0');
    expect(await decisionsOf(OPP.boardBack)).toEqual([]);
  });

  test('detail button, conditions not met: names the next gate, refused, the stage is unchanged', async ({ page }) => {
    const main = await openDetail(page, OPP.detailBlocked);
    const button = main.getByTestId('pipeline-evaluate-gate');
    await expect(button).toHaveText('G1 kapısını değerlendir ve ilerlet');

    await button.click();

    const result = main.getByTestId('pipeline-gate-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText('G1 kapısı geçilmedi; fırsat G0 aşamasında kaldı.');
    await expect(result).toContainText('tanımlı kritik rol yok');
    await page.screenshot({ path: `${SHOTS}/NG-25-05-detail-refused.png`, fullPage: true });

    expect(await stageOf(OPP.detailBlocked)).toBe('G0');
    expect(await decisionsOf(OPP.detailBlocked)).toEqual([{ gate: 'G1', passed: false, decidedBy: USER }]);
  });

  test('detail button, conditions met: advances, says so, and now offers the gate after that', async ({ page }) => {
    const main = await openDetail(page, OPP.detailReady);

    await main.getByTestId('pipeline-evaluate-gate').click();

    const result = main.getByTestId('pipeline-gate-result');
    await expect(result).toContainText('G1 kapısı geçildi; fırsat G1 aşamasına ilerledi.', { timeout: 30_000 });
    await expect(main.getByTestId('pipeline-evaluate-gate')).toHaveText('G2 kapısını değerlendir ve ilerlet', {
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SHOTS}/NG-25-06-detail-advanced.png`, fullPage: true });

    expect(await stageOf(OPP.detailReady)).toBe('G1');
    expect(await decisionsOf(OPP.detailReady)).toEqual([
      { gate: 'G0', passed: true, decidedBy: FIXTURE },
      { gate: 'G1', passed: true, decidedBy: USER },
    ]);
  });

  test('detail button on the last stage: disabled, and says why', async ({ page }) => {
    const main = await openDetail(page, OPP.detailLast);
    const button = main.getByTestId('pipeline-evaluate-gate');

    await expect(button).toHaveText('Son aşama: G4');
    await expect(button).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/NG-25-07-detail-last-stage.png`, fullPage: true });

    expect(await decisionsOf(OPP.detailLast)).toEqual([]);
  });
});

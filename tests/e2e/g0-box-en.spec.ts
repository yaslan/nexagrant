import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { prisma } from '../../src/lib/db';
import { expectHydrated } from './fixtures/hydration';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-69 (K-579051) — the G0 box and the board badge in ENGLISH, by real clicks.
 *
 *   A. A partner with no CORDIS history and two OPEN seats: the real "evaluate" click refuses it.
 *      The box shows the score without "/100", the real denominator (75) and the refusal reason.
 *      The board badge is not green.
 *   B. A G1 opportunity whose latest G0 decision was a refusal: the box shows that saved decision
 *      and its date, never the live "GEÇME"/score.
 *   C. A G1 opportunity with no saved G0 decision: the box shows the empty state.
 *
 * Screenshots and the box DOM are written under the shots folder ("NG-69-en"). The run is on the
 * isolated gate database only (scripts/gate-isolated.sh), never a shared or live one.
 */

const TENANT = 'ng69-en-tenant';
const WORKSPACE = 'ng69-en-workspace';
const SLUG = 'ng69-en';
const USER = 'ng69-en-user';
const EMAIL = 'ng69-en@fabrika.test';

const PROGRAMME = 'ng69-en-programme';
const CALL = 'ng69-en-call';
const STAT_SOURCE = 'ng69-en-e2e';
const TOPIC = { id: 'ng69-en-topic', identifier: 'HORIZON-NG69EN-2026-01-D1-01' };
const KEYWORDS = ['grid flexibility', 'demand response'];

const OTHER_PIC = 'NG69-EN-OTHER-PIC';
const OTHER_PROJECT = 'NG69-EN-OTHER-PROJECT';
const NEW_PIC = 'NG69-EN-NEW-PIC';
const ALL_PICS = [OTHER_PIC, NEW_PIC];

const OPP_OPEN = 'NG-69 EN partner, open seats';
const OPP_SAVED_REFUSED = 'NG-69 EN G1 refused';
const OPP_SAVED_NONE = 'NG-69 EN G1 no decision';

const SHOTS = shotsDir('NG-69-en');
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function rollback() {
  const tenants = { in: [TENANT] };
  await prisma.consortiumSeat.deleteMany({ where: { tenantId: tenants } });
  await prisma.gateDecision.deleteMany({ where: { tenantId: tenants } });
  await prisma.topicMatch.deleteMany({ where: { tenantId: tenants } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: tenants } });
  await prisma.opportunity.deleteMany({ where: { tenantId: tenants } });
  await prisma.tenantProfile.deleteMany({ where: { tenantId: tenants } });
  await prisma.subscription.deleteMany({ where: { tenantId: tenants } });
  await prisma.membership.deleteMany({ where: { tenantId: tenants } });
  await prisma.moduleState.deleteMany({ where: { tenantId: tenants } });
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.workspace.deleteMany({ where: { tenantId: tenants } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
  await prisma.topicStat.deleteMany({ where: { source: STAT_SOURCE } });
  await prisma.topic.deleteMany({ where: { callId: CALL } });
  await prisma.call.deleteMany({ where: { id: CALL } });
  await prisma.programme.deleteMany({ where: { id: PROGRAMME } });
  await prisma.cordisProject.deleteMany({ where: { id: OTHER_PROJECT } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: ALL_PICS } } });
}

async function seed() {
  await rollback();
  await prisma.tenant.create({
    data: { id: TENANT, name: SLUG, slug: SLUG, country: 'TR', orgType: 'SME', kind: 'ORGANIZATION' },
  });
  await prisma.workspace.create({ data: { id: WORKSPACE, tenantId: TENANT, name: SLUG, slug: SLUG } });
  await prisma.user.create({ data: { id: USER, email: EMAIL, name: SLUG, locale: 'en' } });
  await prisma.membership.create({
    data: { userId: USER, tenantId: TENANT, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE] },
  });
  // FIXTURE: Pro plan and the modules the pipeline needs (payment is out of scope).
  await prisma.subscription.create({ data: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' } });
  await prisma.moduleState.createMany({
    data: ['M5', 'M8'].map((moduleId) => ({ tenantId: TENANT, moduleId, status: 'ON' as const, changedBy: STAT_SOURCE })),
  });
  // FIXTURE: catalogue, same shape as the FO-382 spec (lump sum, two stage, 6 M EUR per project).
  await prisma.programme.create({ data: { id: PROGRAMME, name: 'NG-69 EN Programme', sourceKey: STAT_SOURCE } });
  await prisma.call.create({
    data: { id: CALL, programmeId: PROGRAMME, callIdentifier: 'HORIZON-NG69EN-2026', title: 'NG-69 EN Call', currency: 'EUR' },
  });
  await prisma.topic.create({
    data: {
      id: TOPIC.id,
      callId: CALL,
      identifier: TOPIC.identifier,
      title: `NG-69 EN ${TOPIC.id}`,
      status: 'OPEN',
      typeOfAction: 'IA',
      isLumpSum: true,
      isTwoStage: true,
      budgetPerProjectCents: BigInt(600_000_000),
      deadlines: [{ stage: 1, at: '2027-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
      eligibility: {},
      keywords: KEYWORDS,
    },
  });
  await prisma.topicStat.create({
    data: { topicPrefix: 'HORIZON-NG69EN-2026-01-D1', country: null, proposals: 100, funded: 22, successRate: 22, source: STAT_SOURCE },
  });
  // FIXTURE: CORDIS is loaded (another organisation coordinates a project), the tenant's PIC is not in it.
  await prisma.cordisOrganization.create({ data: { organisationId: OTHER_PIC, name: 'NG69 Other Coordinator', country: 'DE' } });
  await prisma.cordisProject.create({
    data: { id: OTHER_PROJECT, framework: 'HORIZON', title: 'NG-69 other project', masterCall: 'HORIZON-NG69EN-2026' },
  });
  await prisma.cordisParticipation.create({
    data: { projectId: OTHER_PROJECT, organisationId: OTHER_PIC, role: 'coordinator' },
  });
  await prisma.cordisOrganization.create({ data: { organisationId: NEW_PIC, name: 'NG69 New Partner', country: 'TR' } });
}

async function seedOpportunities() {
  const topicId = TOPIC.id;
  // A partner with no history and two OPEN seats: no filled seat, so G0 must refuse it.
  const open = await prisma.opportunity.create({
    data: { tenantId: TENANT, workspaceId: WORKSPACE, title: OPP_OPEN, stage: 'G0', intendedRole: 'partner', topicId },
    select: { id: true },
  });
  await prisma.consortiumSeat.createMany({
    data: [
      { tenantId: TENANT, opportunityId: open.id, roleKey: 'research', status: 'OPEN' },
      { tenantId: TENANT, opportunityId: open.id, roleKey: 'end_user', status: 'OPEN' },
    ],
  });
  // G1 with a refused G0 decision on 5 Nov 2026 (saved, not live).
  const refused = await prisma.opportunity.create({
    data: { tenantId: TENANT, workspaceId: WORKSPACE, title: OPP_SAVED_REFUSED, stage: 'G1', intendedRole: 'partner', topicId },
    select: { id: true },
  });
  await prisma.gateDecision.create({
    data: {
      tenantId: TENANT,
      opportunityId: refused.id,
      gate: 'G0',
      passed: false,
      inputs: {},
      ruleVersion: 'ng69-en',
      decidedBy: USER,
      decidedAt: new Date('2026-11-05T10:00:00Z'),
    },
  });
  // G1 with no G0 decision on file at all.
  const none = await prisma.opportunity.create({
    data: { tenantId: TENANT, workspaceId: WORKSPACE, title: OPP_SAVED_NONE, stage: 'G1', intendedRole: 'partner', topicId },
    select: { id: true },
  });
  return { open: open.id, refused: refused.id, none: none.id };
}

const signIn = (page: Page) => signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });

async function saveProfile(page: Page) {
  await page.goto(`/en/${SLUG}/settings/profile`);
  const form = page.locator('main form').first();
  const submit = form.locator('button[type="submit"]');
  await expectHydrated(submit);
  await form.locator('textarea').first().fill('Working on grid flexibility and demand response.');
  await form.locator('input[type="text"]').first().fill(KEYWORDS.join(', '));
  await submit.click();
  await expect
    .poll(async () => (await prisma.tenantProfile.findUnique({ where: { tenantId: TENANT }, select: { keywords: true } }))?.keywords, {
      timeout: 30_000,
    })
    .toEqual(KEYWORDS);
  // FIXTURE: the PIC is set after the save, so the profile form cannot clear it.
  await prisma.tenant.update({ where: { id: TENANT }, data: { pic: NEW_PIC } });
}

function dumpBox(name: string, html: string) {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, `${name}.html`), html);
  console.log(`[NG-69 EN DOM] ${name}: ${html}`);
}

test.describe.serial('NG-69 G0 box and badge in English', () => {
  let ids: { open: string; refused: string; none: string };

  test.beforeAll(async () => {
    await seed();
    ids = await seedOpportunities();
  });

  test.afterAll(async () => {
    if (process.env.NG69_KEEP === '1') return;
    await rollback();
  });

  test('A. refused partner: real evaluate click shows score without /100, the real denominator and the refusal; badge not green', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page);
    await saveProfile(page);

    await page.goto(`/en/${SLUG}/pipeline/${ids.open}`);
    const main = page.locator('main');
    await expectHydrated(main.getByTestId('pipeline-evaluate-current-gate'));
    await main.getByTestId('pipeline-evaluate-current-gate').click();
    await expect(main.getByTestId('pipeline-gate-result')).toBeVisible({ timeout: 60_000 });

    const box = main.getByTestId('pipeline-g0-score');
    await expect(main.getByTestId('pipeline-g0-value')).toHaveText('84');
    await expect(main.getByTestId('pipeline-g0-basis')).toContainText('75');
    await expect(main.getByTestId('pipeline-g0-refusal')).toBeVisible();
    await shot(page, '01-detail-refused-partner');
    dumpBox('01-detail-refused-partner-box', await box.evaluate((el) => el.outerHTML));

    await page.goto(`/en/${SLUG}/pipeline`);
    const badge = page.getByTestId(`pipeline-card-g0-${ids.open}`);
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveAttribute('data-g0-tone', 'amber');
    await expect(badge).toHaveText(/84/);
    await shot(page, '02-board-refused-badge');
    dumpBox('02-board-badge', await badge.evaluate((el) => el.outerHTML));
  });

  test('B. G1 with a saved refused G0 decision: the saved decision and its date, no live GEÇME', async ({ page }) => {
    await signIn(page);
    await page.goto(`/en/${SLUG}/pipeline/${ids.refused}`);
    const main = page.locator('main');
    await expectHydrated(main.getByTestId('pipeline-g0-saved'));
    await expect(main.getByTestId('pipeline-g0-saved')).toHaveText('Latest G0 decision: NOT PASSED');
    await expect(main.getByTestId('pipeline-g0-saved-date')).toContainText('2026');
    await expect(main.getByTestId('pipeline-g0-value')).toHaveCount(0);
    await shot(page, '03-detail-g1-saved-refused');
    dumpBox('03-detail-g1-saved-refused-box', await main.getByTestId('pipeline-g0-score').evaluate((el) => el.outerHTML));
  });

  test('C. G1 with no saved G0 decision: the explicit empty state', async ({ page }) => {
    await signIn(page);
    await page.goto(`/en/${SLUG}/pipeline/${ids.none}`);
    const main = page.locator('main');
    await expectHydrated(main.getByTestId('pipeline-g0-saved-none'));
    await expect(main.getByTestId('pipeline-g0-saved-none')).toHaveText('No saved G0 decision for this opportunity');
    await shot(page, '04-detail-g1-no-decision');
    dumpBox('04-detail-g1-no-decision-box', await main.getByTestId('pipeline-g0-score').evaluate((el) => el.outerHTML));
  });
});

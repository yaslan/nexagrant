import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { expectHydrated } from './fixtures/hydration';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import { presentIds, requireId } from '../helpers/teardown-guard';

/**
 * NG-20 Faz 1 — the consortium screen with today's data: role, country, a three-step stage,
 * the critical-role gap warning, the backup candidate and the budget share range.
 *
 * The gap and backup warnings are not worked out on the screen. They are the lists the G1 gate
 * (src/lib/gates/evaluate.ts) stored on its latest decision (`unfilledCriticalRoles`,
 * `criticalRolesWithoutBackup`); the fixture writes that decision as the gate would. A gate run
 * is not a click on this page, so it is a FIXTURE here, like the CORDIS rows and the budget
 * shares (their editor is not part of this card).
 *
 * NG20_E2E_KEEP=1 leaves the rows in place for inspection after a run.
 */

const SHOTS = shotsDir('NG-20-fe-gnd');
const TENANT = 'demo-tenant';
const WORKSPACE = 'main';
const OPP = 'ng20-e2e-opp';
/** A second opportunity with seats but no G1 decision on file. */
const OPP_NO_G1 = 'ng20-e2e-opp-no-g1';
const SEAT = {
  coordinator: 'ng20-e2e-seat-coordinator',
  research: 'ng20-e2e-seat-research',
  endUser: 'ng20-e2e-seat-end-user',
  industry: 'ng20-e2e-seat-industry',
  widening: 'ng20-e2e-seat-widening',
};
const SEAT_NO_G1 = 'ng20-e2e-seat-no-g1';
const DECISION = 'ng20-e2e-g1-decision';
const URL = `/tr/${WORKSPACE}/pipeline/${OPP}/consortium`;
const USER = { id: 'demo-user-alice', email: 'alice@fabrika.test', tenantId: TENANT, role: 'PIPELINE_MANAGER' };

const PIC = {
  coordinator: 'NG20E2E-PIC-COORD',
  research: 'NG20E2E-PIC-RES',
  widening: 'NG20E2E-PIC-WID',
  backup: 'NG20E2E-PIC-BACKUP',
};

/** The M8 matcher's breakdown shape: only these rows are shown and counted (seat-candidate-view.ts). */
const MATCH_BREAKDOWN = { topicExperience: 30, geographicBalance: 25, collabHistory: 20, rivalRisk: 0 };

async function seed() {
  await rollback();

  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M8' } },
    create: { tenantId: TENANT, moduleId: 'M8', status: 'ON' },
    update: { status: 'ON' },
  });
  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { tenantId: TENANT, slug: WORKSPACE },
    select: { id: true },
  });

  await prisma.opportunity.createMany({
    data: [
      { id: OPP, tenantId: TENANT, workspaceId: workspace.id, title: 'NG-20 e2e — consortium view', stage: 'G0', status: 'ACTIVE' },
      { id: OPP_NO_G1, tenantId: TENANT, workspaceId: workspace.id, title: 'NG-20 e2e — no G1 yet', stage: 'G0', status: 'ACTIVE' },
    ],
  });

  await prisma.cordisOrganization.createMany({
    data: [
      { organisationId: PIC.coordinator, name: 'NG20E2E Fraunhofer Grid', country: 'DE', activityType: 'REC', sme: false },
      { organisationId: PIC.research, name: 'NG20E2E Universitat Valencia', country: 'ES', activityType: 'HES', sme: false },
      { organisationId: PIC.widening, name: 'NG20E2E Anadolu Ar-Ge', country: 'TR', activityType: 'PRC', sme: true },
      { organisationId: PIC.backup, name: 'NG20E2E Delft Backup Lab', country: 'NL', activityType: 'HES', sme: false },
    ],
  });

  await prisma.consortiumSeat.createMany({
    data: [
      { id: SEAT.coordinator, tenantId: TENANT, opportunityId: OPP, roleKey: 'coordinator', status: 'CONFIRMED', organizationId: PIC.coordinator },
      { id: SEAT.research, tenantId: TENANT, opportunityId: OPP, roleKey: 'research', status: 'CONFIRMED', organizationId: PIC.research },
      { id: SEAT.widening, tenantId: TENANT, opportunityId: OPP, roleKey: 'widening', status: 'INVITED', organizationId: PIC.widening },
      { id: SEAT.endUser, tenantId: TENANT, opportunityId: OPP, roleKey: 'end_user', status: 'OPEN' },
      { id: SEAT.industry, tenantId: TENANT, opportunityId: OPP, roleKey: 'industry', status: 'OPEN', required: false },
      { id: SEAT_NO_G1, tenantId: TENANT, opportunityId: OPP_NO_G1, roleKey: 'coordinator', status: 'OPEN' },
    ],
  });

  // The research seat has a visible candidate other than its holder: its backup. The widening
  // seat's only candidate is its own holder, which is no backup.
  await prisma.seatCandidate.createMany({
    data: [
      { tenantId: TENANT, seatId: SEAT.research, organizationId: PIC.research, score: 90, rank: 1, breakdown: MATCH_BREAKDOWN },
      { tenantId: TENANT, seatId: SEAT.research, organizationId: PIC.backup, score: 81, rank: 2, breakdown: MATCH_BREAKDOWN },
      { tenantId: TENANT, seatId: SEAT.widening, organizationId: PIC.widening, score: 64, rank: 1, breakdown: MATCH_BREAKDOWN },
    ],
  });

  // Budget shares (NG-34): agreed, proposed, and none for the other seats.
  await prisma.partnerBudgetShare.createMany({
    data: [
      { tenantId: TENANT, seatId: SEAT.coordinator, minCents: 42_000_000n, maxCents: 52_000_000n, currency: 'EUR', agreedAt: new Date('2026-11-20T10:00:00Z'), agreedById: USER.id },
      { tenantId: TENANT, seatId: SEAT.industry, minCents: 10_000_000n, maxCents: 15_000_000n, currency: 'EUR' },
    ],
  });

  // FIXTURE: what evaluateGate(…, 'G1', …) stores for these seats (src/lib/gates/evaluate.ts).
  await prisma.gateDecision.create({
    data: {
      id: DECISION,
      tenantId: TENANT,
      opportunityId: OPP,
      gate: 'G1',
      passed: false,
      ruleVersion: '1.0',
      decidedBy: USER.id,
      decidedAt: new Date('2026-11-24T09:30:00Z'),
      inputs: {
        opportunityId: OPP,
        criticalSeatsCount: 4,
        unfilledCriticalRoles: ['widening', 'end_user'],
        criticalRolesWithoutBackup: ['coordinator', 'widening', 'end_user'],
      },
    },
  });
}

async function rollback() {
  await prisma.seatCandidate.deleteMany({ where: { seatId: { in: presentIds([...Object.values(SEAT), SEAT_NO_G1]) } } });
  await prisma.partnerBudgetShare.deleteMany({ where: { seatId: { in: presentIds([...Object.values(SEAT), SEAT_NO_G1]) } } });
  await prisma.gateDecision.deleteMany({ where: { id: requireId(DECISION, 'DECISION') } });
  await prisma.gateDecision.deleteMany({ where: { opportunityId: { in: presentIds([OPP, OPP_NO_G1]) } } });
  await prisma.consortiumSeat.deleteMany({ where: { opportunityId: { in: presentIds([OPP, OPP_NO_G1]) } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: presentIds([OPP, OPP_NO_G1]) } } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: presentIds(Object.values(PIC)) } } });
}

async function open(page: Page, url: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await signInAs(page, USER);
  await page.goto(url);
  await page.waitForURL(`**${url}`, { timeout: 30_000 });
}

test.describe('NG-20 consortium view (Faz 1)', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.NG20_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('the gap warning and the backup candidate come from the G1 result', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 500) serverErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    await open(page, URL);

    // 1. Critical roles not filled — the gate's list, in the gate's words, with the decision date.
    const gaps = page.getByTestId('consortium-g1-unfilled');
    await expect(gaps).toBeVisible({ timeout: 30_000 });
    await expect(gaps).toContainText('2 kritik rol henüz kesinleşmedi');
    await expect(gaps).toContainText('Son Kullanıcı');
    await expect(gaps).toContainText('Genişleme Ülkesi');
    await expect(gaps).not.toContainText('Koordinatör');
    await expect(page.getByTestId('consortium-g1-source')).toContainText('24.11.2026');

    // 2. Critical roles without a backup.
    const noBackup = page.getByTestId('consortium-g1-no-backup');
    await expect(noBackup).toContainText('3 kritik rolün yedek adayı yok');
    await expect(noBackup).toContainText('Koordinatör');

    // 3. Rows: role, critical tag, organisation + country, stage, backup, budget share.
    const coordinator = page.getByTestId('m8-builder-seat-coordinator');
    await expect(coordinator).toContainText('KRİTİK');
    await expect(coordinator).toContainText('NG20E2E Fraunhofer Grid');
    await expect(coordinator.getByTestId('seat-country')).toHaveText('DE');
    await expect(coordinator.getByRole('list', { name: 'Aşama: Kesinleşti, 3 adımın 3’ü' })).toBeVisible();
    await expect(coordinator.getByTestId('seat-backup')).toContainText('Yedek yok');
    await expect(coordinator.getByTestId('seat-budget')).toContainText('420.000');
    await expect(coordinator.getByTestId('seat-budget')).toContainText('520.000');
    await expect(coordinator.getByTestId('seat-budget')).toContainText('Mutabık');

    const research = page.getByTestId('m8-builder-seat-research');
    await expect(research.getByTestId('seat-backup')).toContainText('NG20E2E Delft Backup Lab');
    await expect(research.getByTestId('seat-backup')).toContainText('NL');
    await expect(research.getByTestId('seat-backup')).not.toContainText('Yedek yok');
    await expect(research.getByTestId('seat-budget')).toContainText('Girilmedi');

    const widening = page.getByTestId('m8-builder-seat-widening');
    await expect(widening.getByRole('list', { name: 'Aşama: Davet edildi, 3 adımın 2’si' })).toBeVisible();
    await expect(widening.getByTestId('seat-backup')).toContainText('Yedek yok');

    const industry = page.getByTestId('m8-builder-seat-industry');
    await expect(industry).toContainText('İSTEĞE BAĞLI');
    await expect(industry.getByTestId('seat-budget')).toContainText('Önerildi');
    await expect(industry.getByTestId('seat-backup')).not.toContainText('Yedek yok');

    await page.screenshot({ path: `${SHOTS}/01-consortium-view-tr.png`, fullPage: true });

    // 4. A real click on a role in the warning moves focus to that seat's row.
    const endUserLink = gaps.getByRole('link', { name: 'Son Kullanıcı' });
    await expectHydrated(endUserLink);
    await endUserLink.click();
    await expect(page.getByTestId('m8-builder-seat-end_user')).toBeFocused();

    // 5. English.
    await page.goto(URL.replace('/tr/', '/en/'));
    await expect(page.getByTestId('consortium-g1-unfilled')).toContainText('2 critical roles are not confirmed yet', { timeout: 30_000 });
    await expect(page.getByTestId('m8-builder-seat-coordinator').getByTestId('seat-backup')).toContainText('No backup');
    await expect(page.getByTestId('m8-builder-seat-coordinator').getByTestId('seat-budget')).toContainText('Agreed');
    await page.screenshot({ path: `${SHOTS}/02-consortium-view-en.png`, fullPage: true });

    expect(serverErrors, `server errors:\n${serverErrors.join('\n')}`).toEqual([]);
  });

  test('with no G1 decision on file the page says so instead of claiming no gaps', async ({ page }) => {
    await open(page, `/tr/${WORKSPACE}/pipeline/${OPP_NO_G1}/consortium`);
    await expect(page.getByTestId('consortium-g1-none')).toContainText('G1 ön kontrolü bu fırsat için henüz çalışmadı', { timeout: 30_000 });
    await expect(page.getByTestId('consortium-g1-unfilled')).toHaveCount(0);
    await expect(page.getByTestId('consortium-g1-clear')).toHaveCount(0);
  });
});

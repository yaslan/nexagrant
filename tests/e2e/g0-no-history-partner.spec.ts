import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { expectHydrated } from './fixtures/hydration';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * FO-382 (patron K-576759 = A + hard rule): a consortium PARTNER whose PIC has no CORDIS record is
 * scored without the two CORDIS-only features (coordinatorHistory 15, networkCentrality 10), so the
 * denominator is 75 instead of 100. An OPEN seat (no organisation yet) earns nothing. On top of
 * that, such a partner must have at least one FILLED seat (CANDIDATE, INVITED or CONFIRMED) or G0
 * refuses it, whatever the score. Without the rule the same partner passed with 84.
 *
 * The rule needs a PIC (patron 05.11: "PIC boşsa kolaylık yok"). The tenant here HAS a PIC that has
 * no CORDIS row; the PIC-less case is step 3.
 *
 * By real clicks, in a browser, on an isolated database:
 *   0. A new tenant with a PIC that has no CORDIS row. CORDIS is loaded (other organisations have
 *      participations) but none of them is this PIC. Profile → "Yeni Fırsat" form with role
 *      "Konsorsiyum Ortağı". No seat yet: G0 is refused (no filled seat), score 0 seats filled.
 *      The PIC is set on the tenant as a fixture after the profile save, not by clicks.
 *   1. Two seats added as OPEN. G0 is refused: the score is 84 but no seat is filled, so the hard
 *      rule refuses it; the stored evidence gives researchAndEndUser 0.
 *   2. Both seats invited from the candidate search. G0 is run again: scoringBasis
 *      no_history_evidence, denominator 75, two filled seats, score 100, and the gate passes.
 *   3. The PIC is removed (fixture). Same two invited seats: the PIC-less partner is scored on the
 *      standard basis, denominator 100, and the score must not be higher than with the PIC (removing
 *      the PIC never lifts the score). The expected 75 is measured and reported, not assumed.
 *
 * CANDIDATE, CONFIRMED and DECLINED are covered by the unit tests (tests/g0-features.test.ts), not
 * by clicks here: this spec drives only the invite path the UI exposes.
 *
 * Every database row read back is printed with a [FO-382 DB] prefix; that output is the evidence.
 * FO382_KEEP=1 leaves the rows in place.
 */

const TENANT = 'fo382-partner-tenant';
/** The tenant's PIC in step 0-2: it has no CORDIS participation (a measured "no record"). */
const NEW_PIC = 'FO382-NEW-PIC';
const WORKSPACE = 'fo382-partner-workspace';
const SLUG = 'fo382-partner';
const USER = 'fo382-partner-user';
const EMAIL = 'fo382-partner@fabrika.test';

const PROGRAMME = 'fo382-programme';
const CALL = 'fo382-call';
const STAT_SOURCE = 'fo382-e2e';
const TOPIC = { id: 'fo382-topic-ideal', identifier: 'HORIZON-FO382E2E-2026-01-D1-01' };
const KEYWORDS = ['grid flexibility', 'demand response'];

/** Other organisations with CORDIS history: this is what makes the CORDIS table "loaded". */
const OTHER_PIC = 'FO382-OTHER-PIC';
const OTHER_PROJECT = 'FO382-OTHER-PROJECT';
/** Candidate pool for the invitations (CordisOrganization + profile, no participations). */
const PICS = ['FO382-PIC-1', 'FO382-PIC-2', 'FO382-PIC-3'];
const ALL_PICS = [OTHER_PIC, NEW_PIC, ...PICS];

const SHOTS = shotsDir('FO-382-screenshots');
const CONSORTIUM_ROLES = { research: 'Araştırma Ortağı', end_user: 'Son Kullanıcı' } as const;

function dump(step: string, value: unknown) {
  const text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  console.log(`[FO-382 DB] ${step}: ${text}`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function rollback() {
  const tenants = { in: [TENANT] };
  await prisma.seatCandidate.deleteMany({ where: { tenantId: tenants } });
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
  await prisma.cordisOrganization.deleteMany({
    where: { organisationId: { in: ALL_PICS } },
  });
}

async function seed() {
  await rollback();

  // A new account: no PIC, no subscription until the fixture below adds the Pro plan.
  await prisma.tenant.create({
    data: { id: TENANT, name: SLUG, slug: SLUG, country: 'TR', orgType: 'SME', kind: 'ORGANIZATION' },
  });
  await prisma.workspace.create({ data: { id: WORKSPACE, tenantId: TENANT, name: SLUG, slug: SLUG } });
  await prisma.user.create({ data: { id: USER, email: EMAIL, name: SLUG, locale: 'tr' } });
  await prisma.membership.create({
    data: { userId: USER, tenantId: TENANT, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE] },
  });

  // FIXTURE: the Pro plan and the modules the pipeline needs (payment is out of scope).
  await prisma.subscription.create({ data: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' } });
  await prisma.moduleState.createMany({
    data: ['M5', 'M8'].map((moduleId) => ({ tenantId: TENANT, moduleId, status: 'ON' as const, changedBy: STAT_SOURCE })),
  });

  // FIXTURE: catalogue. Lump sum and two stage, budget 6 M EUR per project.
  await prisma.programme.create({ data: { id: PROGRAMME, name: 'FO-382 E2E Programme', sourceKey: STAT_SOURCE } });
  await prisma.call.create({
    data: { id: CALL, programmeId: PROGRAMME, callIdentifier: 'HORIZON-FO382E2E-2026', title: 'FO-382 E2E Call', currency: 'EUR' },
  });
  await prisma.topic.create({
    data: {
      id: TOPIC.id,
      callId: CALL,
      identifier: TOPIC.identifier,
      title: `FO-382 E2E ${TOPIC.id}`,
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
  // FIXTURE: base rate. 22 % is above the 20 % that earns the feature's full mark.
  await prisma.topicStat.create({
    data: { topicPrefix: 'HORIZON-FO382E2E-2026-01-D1', country: null, proposals: 100, funded: 22, successRate: 22, source: STAT_SOURCE },
  });

  // FIXTURE: CORDIS is loaded — one project with a coordinator who is NOT this tenant.
  await prisma.cordisOrganization.create({
    data: { organisationId: OTHER_PIC, name: 'FO382 Other Coordinator', country: 'DE' },
  });
  await prisma.cordisProject.create({
    data: { id: OTHER_PROJECT, framework: 'HORIZON', title: 'FO-382 other project', masterCall: 'HORIZON-FO382E2E-2026' },
  });
  await prisma.cordisParticipation.create({
    data: { projectId: OTHER_PROJECT, organisationId: OTHER_PIC, role: 'coordinator' },
  });

  // FIXTURE: the tenant's own PIC is known to CORDIS but has no participation (step 0-2).
  await prisma.cordisOrganization.create({
    data: { organisationId: NEW_PIC, name: 'FO382 New Partner', country: 'TR' },
  });

  // FIXTURE: the candidate pool the invitations are drawn from.
  for (const [i, pic] of PICS.entries()) {
    await prisma.cordisOrganization.create({
      data: {
        organisationId: pic,
        name: `FO-382 E2E Org ${i + 1}`,
        country: 'DE',
        profile: { create: { name: `FO-382 E2E Org ${i + 1}`, country: 'DE', totalProjects: 100_000 - i } },
      },
    });
  }
}

const signIn = (page: Page) => signInAs(page, { id: USER, email: EMAIL, role: 'TENANT_OWNER', tenantId: TENANT });

async function saveProfile(page: Page) {
  await page.goto(`/tr/${SLUG}/settings/profile`);
  const form = page.locator('main form').first();
  const submit = form.locator('button[type="submit"]');
  await expectHydrated(submit);
  await form.locator('textarea').first().fill('Şebeke esnekliği ve talep yanıtı üzerine çalışan kuruluş.');
  await form.locator('input[type="text"]').first().fill(KEYWORDS.join(', '));
  await submit.click();
  await expect
    .poll(async () => (await prisma.tenantProfile.findUnique({ where: { tenantId: TENANT }, select: { keywords: true } }))?.keywords, {
      timeout: 30_000,
    })
    .toEqual(KEYWORDS);
  // FIXTURE: set the PIC after the save, so the profile form cannot clear it.
  await prisma.tenant.update({ where: { id: TENANT }, data: { pic: NEW_PIC } });
}

/** "Yeni Fırsat" on the board, role set to "Konsorsiyum Ortağı" (partner). */
async function createPartnerFromForm(page: Page, title: string) {
  const hydrated = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/pipeline'), {
    timeout: 60_000,
  });
  await page.goto(`/tr/${SLUG}/pipeline`);
  await hydrated;
  await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('pipeline-add-G0').click();
  const form = page.getByTestId('pipeline-create-form');
  await form.getByTestId('pipeline-create-title').fill(title);
  await form.getByPlaceholder('Örn: HORIZON-CL5-2026-D3-01-01').fill(TOPIC.identifier);
  await form.locator('select:has(option[value="partner"])').selectOption('partner');
  await form.locator('button[type="submit"]').click();
  await expect(page.getByTestId('pipeline-column-G0').getByText(title)).toBeVisible({ timeout: 30_000 });

  const row = await prisma.opportunity.findFirstOrThrow({
    where: { tenantId: TENANT, title },
    select: { id: true, stage: true, intendedRole: true, topicId: true },
  });
  dump(`formdan açılan fırsat "${title}"`, row);
  expect(row.intendedRole).toBe('partner');
  return row;
}

async function openDetail(page: Page, id: string) {
  await page.goto(`/tr/${SLUG}/pipeline/${id}`);
  const main = page.locator('main');
  await expectHydrated(main.getByTestId('pipeline-evaluate-gate'));
  return main;
}

async function decisions(opportunityId: string) {
  return prisma.gateDecision.findMany({
    where: { opportunityId },
    orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    select: { gate: true, passed: true, inputs: true },
  });
}

async function runG0(page: Page, id: string) {
  const main = await openDetail(page, id);
  const before = (await decisions(id)).length;
  await main.getByTestId('pipeline-evaluate-current-gate').click();
  const result = main.getByTestId('pipeline-gate-result');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('pipeline-evaluate-gate')).toBeEnabled({ timeout: 30_000 });
  const after = await decisions(id);
  expect(after).toHaveLength(before + 1);
  return after[after.length - 1]!;
}

/** The G0 evidence the decision stored: the parts a reader is shown and the parts the rule decides. */
function evidenceOf(decision: { inputs: unknown }) {
  const inputs = decision.inputs as {
    calculatedG0Score?: number | null;
    g0Evidence?: {
      score?: number;
      scoringBasis?: string;
      excludedFeatures?: string[];
      denominator?: number;
      filledSeats?: number;
      noHistoryWithoutFilledSeat?: boolean;
      features?: Record<string, number>;
    };
  } | null;
  const ev = inputs?.g0Evidence;
  return {
    calculatedG0Score: inputs?.calculatedG0Score ?? null,
    score: ev?.score ?? null,
    scoringBasis: ev?.scoringBasis ?? null,
    excludedFeatures: ev?.excludedFeatures ?? null,
    denominator: ev?.denominator ?? null,
    filledSeats: ev?.filledSeats ?? null,
    noHistoryWithoutFilledSeat: ev?.noHistoryWithoutFilledSeat ?? null,
    researchAndEndUser: ev?.features?.researchAndEndUser ?? null,
    coordinatorHistory: ev?.features?.coordinatorHistory ?? null,
    networkCentrality: ev?.features?.networkCentrality ?? null,
  };
}

async function addSeat(page: Page, id: string, roleKey: keyof typeof CONSORTIUM_ROLES) {
  await page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES[roleKey]}` }).click();
  await expect(page.getByTestId(`m8-builder-seat-${roleKey}`)).toBeVisible({ timeout: 30_000 });
  const seat = await prisma.consortiumSeat.findFirstOrThrow({
    where: { opportunityId: id, roleKey },
    select: { id: true, roleKey: true, status: true },
  });
  dump(`koltuk eklendi ${roleKey}`, seat);
  return seat;
}

async function inviteFirstCandidate(page: Page, seatId: string, roleKey: keyof typeof CONSORTIUM_ROLES) {
  const card = page.getByTestId(`m8-builder-seat-${roleKey}`);
  await card.getByRole('button', { name: /Aday Bul/ }).click();
  const invite = card.getByRole('button', { name: 'Davet Et' }).first();
  await expect(invite).toBeVisible({ timeout: 60_000 });
  await invite.click();
  await expect
    .poll(async () => (await prisma.consortiumSeat.findUnique({ where: { id: seatId }, select: { status: true } }))?.status, {
      timeout: 30_000,
    })
    .toBe('INVITED');
  dump(`koltuk davet edildi ${roleKey}`, await prisma.consortiumSeat.findUniqueOrThrow({
    where: { id: seatId },
    select: { roleKey: true, status: true, organizationId: true },
  }));
}

test.describe('FO-382 a new partner with no CORDIS record', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.FO382_KEEP === '1') return;
    await rollback();
  });

  test('form → G0: no filled seat refuses a no-history partner; an invited seat passes it on the 75-point basis', async ({ page }) => {
    test.setTimeout(420_000);
    await signIn(page);
    await saveProfile(page);

    const opp = await createPartnerFromForm(page, 'FO-382 yeni ortak');
    await shot(page, '01-formdan-ortak');

    // ── 0. No seat at all. Refused: a no-history partner needs one filled seat.
    const noSeatRun = await runG0(page, opp.id);
    dump('G0, koltuk yok', { passed: noSeatRun.passed, evidence: evidenceOf(noSeatRun) });
    expect(noSeatRun.passed).toBe(false);
    expect(evidenceOf(noSeatRun).filledSeats).toBe(0);
    expect(evidenceOf(noSeatRun).noHistoryWithoutFilledSeat).toBe(true);

    // ── 1. Two seats, both OPEN. The score reaches 84, but no seat is filled: refused.
    await page.goto(`/tr/${SLUG}/pipeline/${opp.id}/consortium`);
    await expectHydrated(page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES.research}` }));
    const research = await addSeat(page, opp.id, 'research');
    const endUser = await addSeat(page, opp.id, 'end_user');
    const openRun = await runG0(page, opp.id);
    dump('G0, koltuklar OPEN', { passed: openRun.passed, evidence: evidenceOf(openRun) });
    await shot(page, '02-g0-acik-koltuk-red');
    // Measured: alignment 30 + base rate 15 + budget 10 + lump sum 8 = 63 over a 75-point
    // denominator gives 84. The open seats contribute nothing (researchAndEndUser 0), and the hard
    // rule refuses the partner because no seat is filled.
    expect(openRun.passed).toBe(false);
    expect(evidenceOf(openRun).scoringBasis).toBe('no_history_evidence');
    expect(evidenceOf(openRun).researchAndEndUser).toBe(0);
    expect(evidenceOf(openRun).denominator).toBe(75);
    expect(evidenceOf(openRun).score).toBe(84);
    expect(evidenceOf(openRun).filledSeats).toBe(0);
    expect(evidenceOf(openRun).noHistoryWithoutFilledSeat).toBe(true);

    // NG-69: the verdict as the user reads it. The refused partner's score is 84, above the 80 line
    // the old board painted green. The card must say "84" without a fixed "/100", give the real
    // basis (denominator 75) and the refusal reason; the board badge must not be green.
    const refusedDetail = await openDetail(page, opp.id);
    await expect(refusedDetail.getByTestId('pipeline-g0-value')).toHaveText('84');
    await expect(refusedDetail.getByTestId('pipeline-g0-basis')).toContainText('75');
    await expect(refusedDetail.getByTestId('pipeline-g0-refusal')).toBeVisible();
    await shot(page, '04-detay-red-gerekcesi');
    await refusedDetail.getByRole('link', { name: "Pipeline'a Geri Dön" }).click();
    await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });
    const refusedBadge = page.getByTestId(`pipeline-card-g0-${opp.id}`);
    await expect(refusedBadge).toContainText('84');
    // The painted colour, not an attribute derived from the same rule: amber text, never the green one.
    await expect(refusedBadge).toHaveClass(/text-amber/);
    await expect(refusedBadge).not.toHaveClass(/text-ok/);
    await shot(page, '05-pano-rozet-red');

    // ── 2. Both seats invited from the candidate search. Now the seats name organisations.
    await page.goto(`/tr/${SLUG}/pipeline/${opp.id}/consortium`);
    await expectHydrated(page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES.research}` }));
    await inviteFirstCandidate(page, research.id, 'research');
    await inviteFirstCandidate(page, endUser.id, 'end_user');

    const invitedRun = await runG0(page, opp.id);
    const ev = evidenceOf(invitedRun);
    dump('G0, koltuklar INVITED', { passed: invitedRun.passed, evidence: ev });
    await shot(page, '03-g0-davetli-gecti');
    expect(ev.scoringBasis).toBe('no_history_evidence');
    expect(ev.excludedFeatures).toEqual(['coordinatorHistory', 'networkCentrality']);
    expect(ev.denominator).toBe(75);
    expect(ev.filledSeats).toBe(2);
    expect(ev.noHistoryWithoutFilledSeat).toBe(false);
    // Both seats now name an organisation: research + end user earn their 12 points → 75/75.
    expect(ev.researchAndEndUser).toBe(50 + 50);
    expect(ev.score).toBe(100);
    expect(invitedRun.passed).toBe(true);

    // NG-69: a passed partner keeps the green badge. The opportunity has moved on to G1 by now, so
    // the detail page's score card is the live recomputation shown beside a G1 stage (see the
    // report's note on G1+ visibility).
    const passedDetail = await openDetail(page, opp.id);
    await expect(passedDetail.getByTestId('pipeline-g0-value')).toHaveText('100');
    await expect(passedDetail.getByTestId('pipeline-g0-refusal')).toHaveCount(0);
    await passedDetail.getByRole('link', { name: "Pipeline'a Geri Dön" }).click();
    await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });
    const passedBadge = page.getByTestId(`pipeline-card-g0-${opp.id}`);
    await expect(passedBadge).toContainText('100');
    await expect(passedBadge).toHaveClass(/text-ok/);
    await shot(page, '06-pano-rozet-gecti');

    // ── 3. The PIC is removed (fixture). The same two invited seats now score on the standard basis.
    // "PIC boşsa kolaylık yok": the 75-point denominator must not apply, and removing the PIC must not
    // raise the score. The 75 below is the measured standard score, reported in the result file.
    await prisma.tenant.update({ where: { id: TENANT }, data: { pic: null } });
    const picLessRun = await runG0(page, opp.id);
    const picLess = evidenceOf(picLessRun);
    dump('G0, PIC kaldırıldı, koltuklar INVITED', { passed: picLessRun.passed, evidence: picLess });
    expect(picLess.scoringBasis).toBe('standard');
    expect(picLess.excludedFeatures).toEqual([]);
    expect(picLess.denominator).toBe(100);
    expect(picLess.noHistoryWithoutFilledSeat).toBe(false);
    expect(picLess.score).toBeLessThanOrEqual(ev.score!);
    expect(picLess.score).toBe(75);
  });
});

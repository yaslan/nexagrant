import { randomUUID } from 'node:crypto';

import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { expectHydrated } from './fixtures/hydration';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import { presentIds } from '../helpers/teardown-guard';

/**
 * NG-27: one opportunity, from the "Yeni Fırsat" form through G0 to G1, by real clicks.
 * NG-28: the seat confirmation is now a click as well, with its refusals.
 *
 * The opportunity, the profile keywords, the seats, the candidates, the invitations, the seat
 * confirmations and both gate decisions come from the browser. What the product offers no screen
 * for comes from this file, and each such write is tagged FIXTURE below so the report can list them:
 *
 *   1. The Pro subscription: a new tenant is on Discover, which has no M8. Payment is out of scope.
 *   2. ModuleState M5 + M8 on the Pro tenant (the fresh-tenant test turns M5 on by the real switch).
 *   3. Topic and its call: the catalogue comes from the platform's import, no tenant writes it.
 *   4. TopicStat: only the platform-admin xlsx import writes it.
 *   5. CordisOrganization + CordisPartnerProfile: the CORDIS import, the only source of candidates.
 *   6. CordisProject + CordisParticipation: the same import, the only source of a PIC's history.
 *
 * The PIC itself and its confirmation are clicks on the profile form (FO-383).
 *
 * The tests that pin the dead ends assert what happens today. They are not skipped or marked
 * expected-to-fail; when a fix lands they go red and have to be rewritten with it.
 *
 * G0_G1_CHAIN_KEEP=1 leaves the rows in place for inspection after a run.
 */

const PRO = 'g0g1-chain-pro-tenant';
const PRO_WORKSPACE = 'g0g1-chain-pro-workspace';
const PRO_SLUG = 'g0g1-chain-pro';
const PRO_USER = 'g0g1-chain-pro-user';
const PRO_EMAIL = 'g0g1-chain-pro@fabrika.test';
/** A member of the Pro tenant: `manage_approvals` is not among a MEMBER's permissions. */
const PRO_MEMBER = 'g0g1-chain-pro-member';
const PRO_MEMBER_EMAIL = 'g0g1-chain-pro-member@fabrika.test';

const FRESH = 'g0g1-chain-fresh-tenant';
const FRESH_WORKSPACE = 'g0g1-chain-fresh-workspace';
const FRESH_SLUG = 'g0g1-chain-fresh';
const FRESH_USER_PREFIX = 'g0g1-chain-fresh-user';
/**
 * The PIC question limits count per user id, in the web server's memory (FO-389), so a fixed id carries
 * the count from one run of this spec to the next on the same server ("58 dakika sonra tekrar deneyin").
 * Each run signs in as a new user: the limit itself is untouched and each run starts from a full allowance.
 */
let FRESH_USER = FRESH_USER_PREFIX;
const FRESH_EMAIL = 'g0g1-chain-fresh@fabrika.test';

const PROGRAMME = 'g0g1-chain-programme';
const CALL = 'g0g1-chain-call';
const STAT_SOURCE = 'g0g1-chain-e2e';
const KEYWORDS = ['grid flexibility', 'demand response'];

/** Lump sum and two stage: the best a topic can give a tenant with no CORDIS history. */
const IDEAL_TOPIC = { id: 'g0g1-chain-topic-ideal', identifier: 'HORIZON-G0G1E2E-2026-01-D1-01' };
/** The same in every way but the two flags, which most topics do not carry. */
const PLAIN_TOPIC = { id: 'g0g1-chain-topic-plain', identifier: 'HORIZON-G0G1E2E-2026-02-D1-01' };
/** A topic no base rate has been imported for. */
const NO_STAT_TOPIC = { id: 'g0g1-chain-topic-nostat', identifier: 'HORIZON-G0G1E2E-2026-03-D1-01' };

const PICS = ['G0G1E2E-PIC-1', 'G0G1E2E-PIC-2', 'G0G1E2E-PIC-3', 'G0G1E2E-PIC-4', 'G0G1E2E-PIC-5'];

/** Saved on the profile form. Nine digits, and no CORDIS row carries this one. */
const PIC_NO_RECORD = '911000001';
/** One coordination outside the topic's family, two collaborators. */
const PIC_THIN = '911000002';
/** No coordination at all, 18 collaborators: the least history that clears 70 on the ideal topic. */
const PIC_NETWORK = '911000003';
/** Three coordinations in each topic's family, 25 collaborators: full marks on both features. */
const PIC_RICH = '911000004';
const COLLABORATORS = Array.from({ length: 25 }, (_, i) => String(922000000 + i));

const SHOTS = shotsDir('NG-28-screenshots');

/** Raw database output, one line per step, so the run log is the evidence. */
function dump(step: string, value: unknown) {
  const text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  console.log(`[NG-27 DB] ${step}: ${text}`);
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/NG-27-${name}.png`, fullPage: true });

async function rollback() {
  const tenants = { in: [PRO, FRESH] };
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
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: [PRO_USER, PRO_MEMBER] } }, { id: { startsWith: FRESH_USER_PREFIX } }] } });
  await prisma.workspace.deleteMany({ where: { tenantId: tenants } });
  await prisma.tenant.deleteMany({ where: { id: tenants } });
  await prisma.topicStat.deleteMany({ where: { source: STAT_SOURCE } });
  await prisma.topic.deleteMany({ where: { callId: CALL } });
  await prisma.call.deleteMany({ where: { id: CALL } });
  await prisma.programme.deleteMany({ where: { id: PROGRAMME } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { startsWith: 'G0G1E2E-PIC-' } } });
  await prisma.cordisParticipation.deleteMany({ where: { projectId: { startsWith: 'g0g1-chain-project-' } } });
  await prisma.cordisProject.deleteMany({ where: { id: { startsWith: 'g0g1-chain-project-' } } });
  await prisma.cordisOrganization.deleteMany({ where: { name: { startsWith: 'G0G1 E2E History' } } });
}

async function seedCordisProject(key: string, masterCall: string, members: [organisationId: string, role: string][]) {
  const id = `g0g1-chain-project-${key}`;
  await prisma.cordisProject.create({ data: { id, title: id, framework: 'HORIZON', masterCall } });
  // M8's candidate pool reads CORDIS topic rows (matching.ts, `cordisProjectTopic.topicCode`), not
  // `masterCall`: without this row a project is invisible to "Aday Bul" (K-579560=A).
  await prisma.cordisProjectTopic.create({ data: { projectId: id, topicCode: masterCall } });
  await prisma.cordisParticipation.createMany({
    data: members.map(([organisationId, role]) => ({ projectId: id, organisationId, role })),
  });
}

async function seedIdentity(tenantId: string, workspaceId: string, slug: string, userId: string, email: string) {
  // The rows `bootstrapOAuthTenant` writes for a new account: no plan, no PIC, no ModuleState.
  await prisma.tenant.create({ data: { id: tenantId, name: slug, slug, country: 'TR', orgType: 'SME', kind: 'ORGANIZATION' } });
  await prisma.workspace.create({ data: { id: workspaceId, tenantId, name: slug, slug } });
  await prisma.user.create({ data: { id: userId, email, name: slug, locale: 'tr' } });
  await prisma.membership.create({ data: { userId, tenantId, role: 'TENANT_OWNER', workspaceIds: [workspaceId] } });
}

async function seed() {
  await rollback();
  FRESH_USER = `${FRESH_USER_PREFIX}-${randomUUID().slice(0, 8)}`;

  await seedIdentity(FRESH, FRESH_WORKSPACE, FRESH_SLUG, FRESH_USER, FRESH_EMAIL);
  await seedIdentity(PRO, PRO_WORKSPACE, PRO_SLUG, PRO_USER, PRO_EMAIL);
  await prisma.user.create({ data: { id: PRO_MEMBER, email: PRO_MEMBER_EMAIL, name: 'member', locale: 'tr' } });
  await prisma.membership.create({ data: { userId: PRO_MEMBER, tenantId: PRO, role: 'MEMBER', workspaceIds: [PRO_WORKSPACE] } });

  // FIXTURE 1 and 2.
  await prisma.subscription.create({ data: { tenantId: PRO, planId: 'pro', status: 'ACTIVE' } });
  await prisma.moduleState.createMany({
    data: ['M5', 'M8'].map((moduleId) => ({ tenantId: PRO, moduleId, status: 'ON' as const, changedBy: STAT_SOURCE })),
  });

  // FIXTURE 3.
  await prisma.programme.create({ data: { id: PROGRAMME, name: 'G0G1 E2E Programme', sourceKey: STAT_SOURCE } });
  await prisma.call.create({
    data: { id: CALL, programmeId: PROGRAMME, callIdentifier: 'HORIZON-G0G1E2E-2026', title: 'G0G1 E2E Call', currency: 'EUR' },
  });
  for (const [topic, flag] of [
    [IDEAL_TOPIC, true],
    [PLAIN_TOPIC, false],
    [NO_STAT_TOPIC, true],
  ] as const) {
    await prisma.topic.create({
      data: {
        id: topic.id,
        callId: CALL,
        identifier: topic.identifier,
        title: `G0G1 E2E ${topic.id}`,
        status: 'OPEN',
        typeOfAction: 'IA',
        isLumpSum: flag,
        isTwoStage: flag,
        // €6,000,000 per project: a coordinator's 20 % share is the budget feature's full mark.
        budgetPerProjectCents: BigInt(600_000_000),
        deadlines: [{ stage: 1, at: '2027-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
        eligibility: {},
        keywords: KEYWORDS,
      },
    });
  }

  // FIXTURE 4. 22 % is above the 20 % that earns the base-rate feature's full mark.
  for (const prefix of ['HORIZON-G0G1E2E-2026-01-D1', 'HORIZON-G0G1E2E-2026-02-D1']) {
    await prisma.topicStat.create({
      data: { topicPrefix: prefix, country: null, proposals: 100, funded: 22, successRate: 22, source: STAT_SOURCE },
    });
  }

  // FIXTURE 5.
  for (const [i, pic] of PICS.entries()) {
    await prisma.cordisOrganization.create({
      data: {
        organisationId: pic,
        name: `G0G1 E2E Org ${i + 1}`,
        country: 'DE',
        // Far above any seeded organisation, so the candidate pool always reaches them.
        profile: { create: { name: `G0G1 E2E Org ${i + 1}`, country: 'DE', totalProjects: 100_000 - i } },
      },
    });
  }

  // FIXTURE 6. None has a CordisPartnerProfile, so none joins the candidate pool of the tests above.
  await prisma.cordisOrganization.createMany({
    data: [
      { organisationId: PIC_THIN, name: 'G0G1 E2E History thin', city: 'Ankara', country: 'TR' },
      { organisationId: PIC_NETWORK, name: 'G0G1 E2E History network', city: 'Ankara', country: 'TR' },
      { organisationId: PIC_RICH, name: 'G0G1 E2E History rich', city: 'Ankara', country: 'TR' },
      ...COLLABORATORS.map((organisationId) => ({ organisationId, name: `G0G1 E2E History partner ${organisationId}`, country: 'DE' })),
    ],
  });
  const partners = (count: number) => COLLABORATORS.slice(0, count).map((pic): [string, string] => [pic, 'participant']);
  await seedCordisProject('thin', 'HORIZON-G0G1E2E-OTHER-2020', [[PIC_THIN, 'coordinator'], ...partners(2)]);
  await seedCordisProject('network', 'HORIZON-G0G1E2E-OTHER-2021', [[PIC_NETWORK, 'participant'], ...partners(18)]);
  for (const [i, family] of ['01', '01', '01', '02', '02', '02'].entries()) {
    await seedCordisProject(`rich-${i}`, `HORIZON-G0G1E2E-2026-${family}-D1`, [
      [PIC_RICH, 'coordinator'],
      ...(i === 0 ? partners(25) : []),
    ]);
  }
}

const signInPro = (page: Page) => signInAs(page, { id: PRO_USER, email: PRO_EMAIL, role: 'TENANT_OWNER', tenantId: PRO });
const signInFresh = (page: Page) =>
  signInAs(page, { id: FRESH_USER, email: FRESH_EMAIL, role: 'TENANT_OWNER', tenantId: FRESH });

/** The profile form, the only tenant-facing source of alignment evidence on the same day. */
async function saveProfile(page: Page, slug: string, tenantId: string) {
  await page.goto(`/tr/${slug}/settings/profile`);
  const form = page.locator('main form').first();
  const submit = form.locator('button[type="submit"]');
  await expectHydrated(submit);
  await form.locator('textarea').first().fill('Şebeke esnekliği ve talep yanıtı üzerine çalışan kuruluş.');
  await form.locator('input[type="text"]').first().fill(KEYWORDS.join(', '));
  await submit.click();
  await expect
    .poll(async () => (await prisma.tenantProfile.findUnique({ where: { tenantId }, select: { keywords: true } }))?.keywords, {
      timeout: 30_000,
    })
    .toEqual(KEYWORDS);
  dump('profil formu kaydedildi', await prisma.tenantProfile.findUnique({ where: { tenantId }, select: { keywords: true } }));
}

const storedPic = async (tenantId: string) =>
  (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { pic: true } })).pic;

/** The PIC field on the profile form, up to the point the form asks or answers. */
async function submitPic(page: Page, slug: string, pic: string) {
  await page.goto(`/tr/${slug}/settings/profile`);
  const input = page.getByTestId('tenant-pic-input');
  await expectHydrated(input);
  await input.fill(pic);
  await page.getByRole('button', { name: 'Profili Kaydet' }).click();
}

/** A PIC CORDIS knows: the form names the organisation and stores nothing before the yes. */
async function confirmCordisPic(page: Page, slug: string, tenantId: string, pic: string, organisation: string) {
  await submitPic(page, slug, pic);
  const confirm = page.getByTestId('tenant-pic-confirm');
  await expect(confirm).toContainText(organisation, { timeout: 30_000 });
  expect(await storedPic(tenantId)).not.toBe(pic);
  await page.getByTestId('tenant-pic-confirm-yes').click();
  await expect.poll(() => storedPic(tenantId), { timeout: 30_000 }).toBe(pic);
  dump(`PIC onaylandı ${organisation}`, await storedPic(tenantId));
}

/** "Yeni Fırsat" on the board. Returns the id the database gave the row. */
async function createFromForm(page: Page, slug: string, tenantId: string, title: string, topicIdentifier?: string) {
  // The board loads its members from an effect, so this POST also says React has hydrated.
  const hydrated = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/pipeline'), {
    timeout: 60_000,
  });
  await page.goto(`/tr/${slug}/pipeline`);
  await hydrated;
  await expect(page.getByTestId('pipeline-board')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('pipeline-add-G0').click();
  const form = page.getByTestId('pipeline-create-form');
  await form.getByTestId('pipeline-create-title').fill(title);
  if (topicIdentifier) await form.getByPlaceholder('Örn: HORIZON-CL5-2026-D3-01-01').fill(topicIdentifier);
  await form.locator('button[type="submit"]').click();
  await expect(page.getByTestId('pipeline-column-G0').getByText(title)).toBeVisible({ timeout: 30_000 });

  const row = await prisma.opportunity.findFirstOrThrow({
    where: { tenantId, title },
    select: { id: true, title: true, topicId: true, stage: true, ownerId: true, intendedRole: true, g0Score: true },
  });
  dump(`formdan açılan fırsat "${title}"`, row);
  return row;
}

async function openDetail(page: Page, slug: string, id: string) {
  await page.goto(`/tr/${slug}/pipeline/${id}`);
  const main = page.locator('main');
  await expectHydrated(main.getByTestId('pipeline-evaluate-gate'));
  return main;
}

async function decisions(opportunityId: string) {
  return prisma.gateDecision.findMany({
    where: { opportunityId },
    orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    select: { gate: true, passed: true, decidedBy: true, inputs: true },
  });
}

/** The composite the gate stored on its decision; `null` is "no evidence to score on". */
function storedScore(inputs: unknown): number | null | undefined {
  return (inputs as { calculatedG0Score?: number | null } | null)?.calculatedG0Score;
}

/** Runs G0 from the detail page and returns the decision that click wrote. */
async function runG0(page: Page, slug: string, id: string) {
  const main = await openDetail(page, slug, id);
  const before = (await decisions(id)).length;
  await main.getByTestId('pipeline-evaluate-current-gate').click();
  const result = main.getByTestId('pipeline-gate-result');
  await expect(result).toBeVisible({ timeout: 30_000 });
  // The banner lands before the transition ends; a shot taken now shows the button still busy.
  await expect(main.getByTestId('pipeline-evaluate-gate')).toBeEnabled({ timeout: 30_000 });
  const banner = await result.innerText();
  console.log(`[NG-27 EKRAN] G0 sonucu: ${banner.replace(/\s+/g, ' ')}`);
  const after = await decisions(id);
  expect(after).toHaveLength(before + 1);
  return { ...after[after.length - 1]!, banner };
}

const CONSORTIUM_ROLES = { research: 'Araştırma Ortağı', end_user: 'Son Kullanıcı', industry: 'Sanayi Ortağı' } as const;

async function openConsortium(page: Page, slug: string, id: string) {
  await page.goto(`/tr/${slug}/pipeline/${id}/consortium`);
  const add = page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES.research}` });
  await expectHydrated(add);
}

async function addSeat(page: Page, id: string, roleKey: keyof typeof CONSORTIUM_ROLES) {
  await page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES[roleKey]}` }).click();
  await expect(page.getByTestId(`m8-builder-seat-${roleKey}`)).toBeVisible({ timeout: 30_000 });
  const seat = await prisma.consortiumSeat.findFirstOrThrow({
    where: { opportunityId: id, roleKey },
    select: { id: true, roleKey: true, status: true, required: true, organizationId: true },
  });
  dump(`koltuk eklendi ${roleKey}`, seat);
  return seat;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findAndInvite(page: Page, seatId: string, roleKey: keyof typeof CONSORTIUM_ROLES, organizationId?: string) {
  const card = page.getByTestId(`m8-builder-seat-${roleKey}`);
  await card.getByRole('button', { name: /Aday Bul/ }).click();
  // The search is done when the candidate list is on screen: its heading only renders once the
  // action's rows are in (the seat starts empty), and the button is back to "Aday Bul".
  await expect(card.getByRole('heading', { name: 'EN İYİ ADAYLAR' })).toBeVisible({ timeout: 60_000 });
  await expect(card.getByRole('button', { name: /Aday Bul/ })).toBeEnabled({ timeout: 60_000 });
  // A row names the organisation by its PIC until the page refresh lands, then by its name. The
  // name comes from the same table the screen reads, never from a guess (NG-287: a name derived from
  // the PICS list was "Org 0" for a CORDIS history organisation, so the row vanished once the name
  // arrived). The row is found by either, and the database below says which organisation was invited.
  const rowLabel = organizationId
    ? new RegExp(
        `${escapeRegExp(organizationId)}(?!\\d)|${escapeRegExp(
          (await prisma.cordisOrganization.findUniqueOrThrow({ where: { organisationId: organizationId }, select: { name: true } })).name,
        )}(?!\\d)`,
      )
    : null;
  const invite = rowLabel
    ? card
        .locator('div')
        .filter({ hasText: rowLabel })
        .filter({ has: page.getByRole('button', { name: 'Davet Et' }) })
        .last()
        .getByRole('button', { name: 'Davet Et' })
    : card.getByRole('button', { name: 'Davet Et' }).first();
  await expect(invite).toBeVisible({ timeout: 60_000 });
  await invite.click();
  await expect
    .poll(async () => (await prisma.consortiumSeat.findUnique({ where: { id: seatId }, select: { status: true } }))?.status, {
      timeout: 30_000,
    })
    .toBe('INVITED');
  const invited = await prisma.consortiumSeat.findUniqueOrThrow({
    where: { id: seatId },
    select: { roleKey: true, status: true, organizationId: true },
  });
  dump(`koltuk davet edildi ${roleKey}`, invited);
  if (organizationId) expect(invited.organizationId).toBe(organizationId);
}

const seatRow = (id: string) =>
  prisma.consortiumSeat.findUniqueOrThrow({ where: { id }, select: { roleKey: true, status: true, organizationId: true } });

/** The onay düğmesi: the screen may say ONAYLANDI only after the server wrote it. */
async function confirmByClick(page: Page, seatId: string, roleKey: keyof typeof CONSORTIUM_ROLES) {
  const card = page.getByTestId(`m8-builder-seat-${roleKey}`);
  await expect(card.getByText('ONAYLANDI')).toHaveCount(0);
  await card.getByTestId('m8-builder-seat-confirm').click();
  await expect(card.getByText('ONAYLANDI')).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId('m8-builder-seat-confirm')).toHaveCount(0);
  const row = await seatRow(seatId);
  dump(`koltuk düğmeyle onaylandı ${roleKey}`, row);
  expect(row.status).toBe('CONFIRMED');
}

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 2400 } });

test.beforeAll(seed);
test.afterAll(async () => {
  if (process.env.G0_G1_CHAIN_KEEP !== '1') await rollback();
  await prisma.$disconnect();
});

test.describe('NG-27 the chain on one opportunity', () => {
  test('form → G0 by the detail button → seat confirmation by its button → G1', async ({ page }) => {
    test.setTimeout(300_000);
    await signInPro(page);

    // ── 1. Alignment evidence from the profile form.
    await saveProfile(page, PRO_SLUG, PRO);
    await shot(page, '01-profil-kaydedildi');

    // ── 2. The opportunity, from the board's form.
    const opp = await createFromForm(page, PRO_SLUG, PRO, 'NG-27 zincir fırsatı', IDEAL_TOPIC.identifier);
    await shot(page, '02-formdan-firsat');
    expect(opp.stage).toBe('G0');
    expect(opp.ownerId).toBe(PRO_USER);
    expect(opp.topicId).toBe(IDEAL_TOPIC.identifier);

    // ── 3. G0 with no consortium yet: alignment 30 + base rate 15 + budget 10 + lump sum 8.
    const withoutSeats = await runG0(page, PRO_SLUG, opp.id);
    dump('G0 tıklandı, koltuksuz', withoutSeats);
    await shot(page, '03-g0-koltuksuz-red');
    expect(withoutSeats.passed).toBe(false);
    expect(withoutSeats.decidedBy).toBe(PRO_USER);
    expect(storedScore(withoutSeats.inputs)).toBe(63);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } })).g0Score).toBe(63);

    // ── 4. The consortium, from its own page: seats, candidates, invitations.
    await openConsortium(page, PRO_SLUG, opp.id);
    const research = await addSeat(page, opp.id, 'research');
    const endUser = await addSeat(page, opp.id, 'end_user');
    await findAndInvite(page, research.id, 'research');
    await findAndInvite(page, endUser.id, 'end_user');
    await page.reload();
    await expect(page.getByTestId('m8-builder-seat-research')).toBeVisible({ timeout: 30_000 });
    await shot(page, '04-koltuklar-davet-edildi');

    // ── The owner is offered the confirmation on both invited seats.
    for (const roleKey of ['research', 'end_user'] as const) {
      await expect(page.getByTestId(`m8-builder-seat-${roleKey}`).getByTestId('m8-builder-seat-confirm')).toHaveText(
        'Kurum katılımını teyit etti',
      );
    }

    const candidates = await prisma.seatCandidate.findMany({
      where: { seatId: { in: [research.id, endUser.id] } },
      select: { seatId: true, organizationId: true, rank: true },
      orderBy: [{ seatId: 'asc' }, { rank: 'asc' }],
    });
    dump('Aday Bul tıklamasının yazdığı adaylar', candidates.map((c) => ({
      seat: c.seatId === research.id ? 'research' : 'end_user',
      organizationId: c.organizationId,
      rank: c.rank,
    })));

    // ── 5. G0 again, both roles on the seat plan but only INVITED. NG-59 (patron K-579082 = A): the
    //    general score counts only CONFIRMED seats, so the invitations add nothing: 63 stays 63 and
    //    the gate refuses. Before NG-59 this click gave 75 and passed.
    const invitedG0 = await runG0(page, PRO_SLUG, opp.id);
    dump('G0 tıklandı, koltuklar INVITED', invitedG0);
    await shot(page, '05-g0-davetli-koltuk-63-red');
    expect(invitedG0.passed).toBe(false);
    expect(storedScore(invitedG0.inputs)).toBe(63);
    // One score on the record: the score shown is the one the evidence gives (NG-27 side finding).
    const invitedInputs = invitedG0.inputs as { g0Score?: number | null; g0ScoreStored?: number | null; g0Evidence?: { score?: number; filledSeats?: number; features?: { researchAndEndUser?: number } } };
    expect(invitedInputs.g0Score).toBe(63);
    expect(invitedInputs.g0Evidence?.score).toBe(63);
    expect(invitedInputs.g0ScoreStored).toBe(63);
    expect(invitedInputs.g0Evidence?.features?.researchAndEndUser).toBe(0);
    expect(invitedInputs.g0Evidence?.filledSeats).toBe(2);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } })).g0Score).toBe(63);

    // ── 6. G1 from the screen alone: refused, G0 has not been passed (NG-26).
    let main = await openDetail(page, PRO_SLUG, opp.id);
    await main.getByTestId('pipeline-evaluate-gate').click();
    await expect(main.getByTestId('pipeline-gate-result')).toBeVisible({ timeout: 30_000 });
    await expect(main.getByTestId('pipeline-evaluate-gate')).toBeEnabled({ timeout: 30_000 });
    await shot(page, '06-g1-g0-gecilmeden-red');
    const refusedG1 = (await decisions(opp.id)).at(-1)!;
    dump('G1 tıklandı, G0 geçilmedi', refusedG1);
    expect(refusedG1.gate).toBe('G1');
    expect(refusedG1.passed).toBe(false);
    expect(refusedG1.inputs as { latestG0Passed?: boolean | null }).toMatchObject({ latestG0Passed: false });

    // ── 7. The seats' move to CONFIRMED, by the button on the consortium page. Nothing is written
    //    from this file: the status comes from `confirmSeatAssignment`. Each confirmation raises the
    //    score by its 6 points: one confirmed seat 69 (still refused), both 75 (passes).
    await openConsortium(page, PRO_SLUG, opp.id);
    await confirmByClick(page, research.id, 'research');
    const oneConfirmedG0 = await runG0(page, PRO_SLUG, opp.id);
    dump('G0 tıklandı, araştırma CONFIRMED, son kullanıcı INVITED', oneConfirmedG0);
    await shot(page, '06a-g0-bir-onayli-69-red');
    expect(oneConfirmedG0.passed).toBe(false);
    expect(storedScore(oneConfirmedG0.inputs)).toBe(69);

    await openConsortium(page, PRO_SLUG, opp.id);
    await confirmByClick(page, endUser.id, 'end_user');
    await shot(page, '06b-koltuklar-dugmeyle-onaylandi');
    dump('koltuklar düğmeyle onaylandı', await prisma.consortiumSeat.findMany({
      where: { opportunityId: opp.id },
      select: { roleKey: true, status: true, organizationId: true, required: true },
      orderBy: { roleKey: 'asc' },
    }));
    const passedG0 = await runG0(page, PRO_SLUG, opp.id);
    dump('G0 tıklandı, iki koltuk CONFIRMED', passedG0);
    await shot(page, '06c-g0-onayli-75-gecti');
    expect(passedG0.passed).toBe(true);
    expect(passedG0.decidedBy).toBe(PRO_USER);
    expect(storedScore(passedG0.inputs)).toBe(75);
    const afterG0 = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opp.id },
      select: { stage: true, g0Score: true },
    });
    dump('G0 sonrası fırsat', afterG0);
    expect(afterG0).toEqual({ stage: 'G0', g0Score: 75 });

    // ── 8. G1 by the detail button. NG-364: G1 also wants a letter of intent from every critical
    // member; the screen that records it is fe-gnd's, so the fixture writes it here.
    await prisma.consortiumSeat.updateMany({
      where: { id: { in: presentIds([research.id, endUser.id]) }, tenantId: PRO, status: 'CONFIRMED' },
      data: { memberStage: 'CONFIRMED',loiReceivedAt: new Date('2026-11-01T00:00:00Z') },
    });
    main = await openDetail(page, PRO_SLUG, opp.id);
    await main.getByTestId('pipeline-evaluate-gate').click();
    await expect(main.getByTestId('pipeline-gate-result')).toContainText('G1 kapısı geçildi', { timeout: 30_000 });
    // The stage badge moves when the refresh that follows the banner has landed.
    await expect(main.getByText('G1', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByTestId('pipeline-evaluate-gate')).toBeEnabled({ timeout: 30_000 });
    await shot(page, '07-g1-gecti');

    const final = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id }, select: { stage: true, status: true } });
    const all = await decisions(opp.id);
    dump('SON: fırsat', final);
    dump('SON: kapı kararları', all.map((d) => ({ gate: d.gate, passed: d.passed, decidedBy: d.decidedBy, score: storedScore(d.inputs) ?? null })));
    expect(final.stage).toBe('G1');
    expect(all.map((d) => [d.gate, d.passed])).toEqual([
      ['G0', false],
      ['G0', false],
      ['G1', false],
      ['G0', false],
      ['G0', true],
      ['G1', true],
    ]);
    expect(new Set(all.map((d) => d.decidedBy))).toEqual(new Set([PRO_USER]));

    // ── 9. The board agrees.
    const hydrated = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/pipeline'), {
      timeout: 60_000,
    });
    await page.goto(`/tr/${PRO_SLUG}/pipeline`);
    await hydrated;
    await expect(page.getByTestId('pipeline-column-G1').getByTestId(`pipeline-card-${opp.id}`)).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '08-pano-g1-sutunu');
  });
});

test.describe('NG-28 what the seat confirmation refuses', () => {
  test('a same-call conflict, a seat that changed behind the screen, and a role without the permission', async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 2400 } });
    const page = await context.newPage();
    await signInAs(page, { id: PRO_USER, email: PRO_EMAIL, role: 'TENANT_OWNER', tenantId: PRO });

    // Confirmed on the chain's opportunity, an active one on the same call but another topic.
    const chain = await prisma.opportunity.findFirstOrThrow({ where: { tenantId: PRO, title: 'NG-27 zincir fırsatı' }, select: { id: true } });
    const confirmedElsewhere = await prisma.consortiumSeat.findFirstOrThrow({
      where: { opportunityId: chain.id, roleKey: 'research', status: 'CONFIRMED' },
      select: { organizationId: true },
    });
    const conflictOrg = confirmedElsewhere.organizationId!;

    const opp = await createFromForm(page, PRO_SLUG, PRO, 'NG-28 onay sınırları', PLAIN_TOPIC.identifier);
    await openConsortium(page, PRO_SLUG, opp.id);
    const research = await addSeat(page, opp.id, 'research');
    const endUser = await addSeat(page, opp.id, 'end_user');
    const industry = await addSeat(page, opp.id, 'industry');
    await findAndInvite(page, research.id, 'research', conflictOrg);
    await findAndInvite(page, endUser.id, 'end_user');
    await findAndInvite(page, industry.id, 'industry');
    await page.reload();
    await expectHydrated(page.getByTestId('m8-builder-seat-research').getByTestId('m8-builder-seat-confirm'));

    const alert = page.locator('main').getByRole('alert');

    // ── Conflict, in Turkish: a sentence, no raw English, no other opportunity's name.
    await page.getByTestId('m8-builder-seat-research').getByTestId('m8-builder-seat-confirm').click();
    await expect(alert).toContainText('aynı çağrıda başka bir etkin fırsatta', { timeout: 30_000 });
    console.log(`[NG-28 EKRAN] çakışma: ${await alert.innerText()}`);
    await expect(alert).not.toContainText('NG-27');
    await expect(alert).not.toContainText('Conflict');
    await expect(page.getByTestId('m8-builder-seat-research').getByText('ONAYLANDI')).toHaveCount(0);
    await shot(page, '20-cakisma-tr');
    dump('çakışma sonrası koltuk', await seatRow(research.id));
    expect(await seatRow(research.id)).toEqual({ roleKey: 'research', status: 'INVITED', organizationId: conflictOrg });

    // ── The same refusal in English.
    await page.goto(`/en/${PRO_SLUG}/pipeline/${opp.id}/consortium`);
    const enConfirm = page.getByTestId('m8-builder-seat-research').getByTestId('m8-builder-seat-confirm');
    await expectHydrated(enConfirm);
    await expect(enConfirm).toHaveText('Organisation confirmed participation');
    await enConfirm.click();
    await expect(alert).toContainText('another active opportunity on the same call', { timeout: 30_000 });
    console.log(`[NG-28 EKRAN] çakışma EN: ${await alert.innerText()}`);
    await expect(alert).not.toContainText('NG-27');
    await shot(page, '21-cakisma-en');
    expect((await seatRow(research.id)).status).toBe('INVITED');

    // ── The seat changes after the page rendered: the write matches 0 rows, and that is no success.
    await page.goto(`/tr/${PRO_SLUG}/pipeline/${opp.id}/consortium`);
    const stale = page.getByTestId('m8-builder-seat-end_user').getByTestId('m8-builder-seat-confirm');
    await expectHydrated(stale);
    // Not a fixture of the chain: another session's change, staged between the render and the click.
    await prisma.consortiumSeat.update({ where: { id: endUser.id }, data: { status: 'DECLINED' } });
    await stale.click();
    await expect(alert).toContainText('Bu koltuğun durumu değişti', { timeout: 30_000 });
    console.log(`[NG-28 EKRAN] 0 satır: ${await alert.innerText()}`);
    await expect(page.getByTestId('m8-builder-seat-end_user').getByText('ONAYLANDI')).toHaveCount(0);
    await shot(page, '22-koltuk-degisti');
    dump('0 satır sonrası koltuk', await seatRow(endUser.id));
    expect((await seatRow(endUser.id)).status).toBe('DECLINED');

    // ── The same seat re-invited to someone else: the button named the organisation on screen.
    await prisma.consortiumSeat.update({ where: { id: endUser.id }, data: { status: 'INVITED', organizationId: 'G0G1E2E-PIC-3' } });
    await page.reload();
    await expectHydrated(stale);
    await prisma.consortiumSeat.update({ where: { id: endUser.id }, data: { organizationId: 'G0G1E2E-PIC-5' } });
    await stale.click();
    await expect(alert).toContainText('Bu koltuğun durumu değişti', { timeout: 30_000 });
    dump('başka kuruma yeniden davet sonrası koltuk', await seatRow(endUser.id));
    expect(await seatRow(endUser.id)).toEqual({ roleKey: 'end_user', status: 'INVITED', organizationId: 'G0G1E2E-PIC-5' });

    // ── A role without the permission on a page rendered for the owner: this click is the direct
    //    call. Only the session changes; the server has to say no by itself.
    await page.reload();
    const held = page.getByTestId('m8-builder-seat-industry').getByTestId('m8-builder-seat-confirm');
    await expectHydrated(held);
    await context.clearCookies();
    await signInAs(page, { id: PRO_MEMBER, email: PRO_MEMBER_EMAIL, role: 'MEMBER', tenantId: PRO });
    const sent = page.waitForRequest((r) => r.method() === 'POST' && r.headers()['next-action'] !== undefined);
    const answered = page.waitForResponse((r) => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined);
    await held.click();
    await sent;
    console.log(`[NG-28 HTTP] MEMBER eylem çağrısı: ${(await answered).status()}`);
    await expect(alert).toContainText('Rolünüz bu işlem için yetkili değil', { timeout: 30_000 });
    await shot(page, '23-yetkisiz-dogrudan-cagri');
    dump('MEMBER doğrudan çağrı sonrası koltuk', await seatRow(industry.id));
    expect((await seatRow(industry.id)).status).toBe('INVITED');

    // ── The same member, on a fresh render: no button at all, the seat's state still shown.
    await page.goto(`/tr/${PRO_SLUG}/pipeline/${opp.id}/consortium`);
    await expect(page.getByTestId('m8-builder-seat-industry').getByText('DAVET EDİLDİ')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('m8-builder-seat-confirm')).toHaveCount(0);
    await shot(page, '24-member-dugme-yok');

    await context.close();
  });
});

test.describe('NG-27 where a new user stops', () => {
  test('on the free plan only a confirmed CORDIS history clears 70, and G1 stays shut without M8', async ({ page }) => {
    test.setTimeout(360_000);
    await signInFresh(page);

    // ── 1. The board is closed until the owner finds the module switch.
    await page.goto(`/tr/${FRESH_SLUG}/pipeline`);
    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pipeline-board')).toHaveCount(0);
    // Nor does the menu offer the board: a new user has no link to it until M5 is on.
    await expect(page.getByRole('link', { name: 'Fırsatlar' })).toHaveCount(0);
    await shot(page, '10-taze-hesap-pano-kilitli');
    dump('taze hesap ModuleState', await prisma.moduleState.findMany({ where: { tenantId: FRESH }, select: { moduleId: true, status: true } }));

    await page.goto(`/tr/${FRESH_SLUG}/settings/modules`);
    const m5Card = page.getByTestId('module-card-M5');
    const enable = m5Card.getByRole('button', { name: 'Aç', exact: true });
    await expectHydrated(enable);
    await enable.click();
    await expect
      .poll(async () => (await prisma.moduleState.findUnique({
        where: { tenantId_moduleId: { tenantId: FRESH, moduleId: 'M5' } },
        select: { status: true },
      }))?.status, { timeout: 30_000 })
      .toBe('ON');
    dump('M5 modül anahtarından açıldı', await prisma.moduleState.findMany({ where: { tenantId: FRESH }, select: { moduleId: true, status: true } }));

    // ── 2. An opportunity with nothing behind it: no evidence, no score, a refusal that says so.
    const empty = await createFromForm(page, FRESH_SLUG, FRESH, 'NG-27 kanıtsız fırsat');
    expect(empty.g0Score).toBeNull();
    const noEvidence = await runG0(page, FRESH_SLUG, empty.id);
    dump('G0 tıklandı, konu ve profil yok', noEvidence);
    await shot(page, '11-taze-hesap-kanit-yok');
    expect(noEvidence.passed).toBe(false);
    expect(storedScore(noEvidence.inputs)).toBeNull();

    // ── 3. Everything a Discover tenant with no PIC can do, on the best topic the catalogue can hold.
    await saveProfile(page, FRESH_SLUG, FRESH);
    await expect(page.getByTestId('tenant-pic-input')).toHaveValue('');
    await shot(page, '12-taze-hesap-pic-bos');
    expect(await storedPic(FRESH)).toBeNull();

    const best = await createFromForm(page, FRESH_SLUG, FRESH, 'NG-27 en iyi konu', IDEAL_TOPIC.identifier);
    const plain = await createFromForm(page, FRESH_SLUG, FRESH, 'NG-27 sıradan konu, ücretsiz', PLAIN_TOPIC.identifier);
    // Every score below is the coordinator's scale: the form opens an opportunity with that role.
    expect(best.intendedRole).toBe('coordinator');
    expect(plain.intendedRole).toBe('coordinator');

    const expectG0 = async (label: string, id: string, score: number, passed: boolean, shotName: string) => {
      const run = await runG0(page, FRESH_SLUG, id);
      dump(`G0 tıklandı, ${label}`, { pic: await storedPic(FRESH), passed: run.passed, score: storedScore(run.inputs), banner: run.banner });
      await shot(page, shotName);
      expect(storedScore(run.inputs)).toBe(score);
      expect(run.passed).toBe(passed);
      expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).g0Score).toBe(score);
    };

    await expectG0('PIC yok, en iyi konu', best.id, 63, false, '13-taze-hesap-63-red');
    await expectG0('PIC yok, sıradan konu', plain.id, 55, false, '13b-taze-hesap-siradan-55-red');

    // ── 4. The 12 points the seats would give need M8, which Discover has not got.
    await page.goto(`/tr/${FRESH_SLUG}/pipeline/${best.id}/consortium`);
    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES.research}` })).toHaveCount(0);
    await shot(page, '14-taze-hesap-konsorsiyum-kilitli');

    // ── 5. A PIC with no CORDIS record adds nothing: a new organisation with no history stays below 70.
    await submitPic(page, FRESH_SLUG, PIC_NO_RECORD);
    await expect(page.getByTestId('tenant-pic-feedback')).toContainText("CORDIS'te bu koda ait kayıt bulamadık", { timeout: 30_000 });
    expect(await storedPic(FRESH)).toBe(PIC_NO_RECORD);
    await expectG0('PIC var, CORDIS kaydı yok, en iyi konu', best.id, 63, false, '15-pic-cordis-yok-63-red');
    await expectG0('PIC var, CORDIS kaydı yok, sıradan konu', plain.id, 55, false, '15b-pic-cordis-yok-55-red');

    // ── 6. A thin history moves the score and does not clear the threshold.
    await confirmCordisPic(page, FRESH_SLUG, FRESH, PIC_THIN, 'G0G1 E2E History thin');
    await expectG0('ince geçmiş, en iyi konu', best.id, 65.05, false, '16-ince-gecmis-65-red');
    await expectG0('ince geçmiş, sıradan konu', plain.id, 57.05, false, '16b-ince-gecmis-57-red');

    // ── 7. K-577043 = A: history is what clears 70 on the free plan, and the confirmation is a
    //    declaration, not proof of ownership (FO-383). 63 + 18/25 of the network feature's 10.
    await confirmCordisPic(page, FRESH_SLUG, FRESH, PIC_NETWORK, 'G0G1 E2E History network');
    await expectG0('18 ortak, en iyi konu', best.id, 70.2, true, '17-ag-gecmisi-70-gecti');
    await expectG0('18 ortak, sıradan konu', plain.id, 62.2, false, '17b-ag-gecmisi-62-red');

    // FO-389: this account asks four PIC questions in a row, and a tenant nobody vouched for gets three
    // an hour. The first three are asked exactly as a new, uninvited account asks them (FO-389 review
    // Ö-1: the spec used to invite it from the start and stopped proving that path). Before the fourth
    // an agency invites it (the Pro tenant plays the agency): still on Discover with no plan and no M8,
    // which is all the rest of this spec is about. The limit itself has its own spec
    // (profile-pic-unsolicited).
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: FRESH }, select: { agencyId: true } })).toEqual({ agencyId: null });
    await prisma.tenant.update({ where: { id: FRESH }, data: { agencyId: PRO } });
    await confirmCordisPic(page, FRESH_SLUG, FRESH, PIC_RICH, 'G0G1 E2E History rich');
    await expectG0('zengin geçmiş, en iyi konu', best.id, 88, true, '18-zengin-gecmis-88-gecti');
    await expectG0('zengin geçmiş, sıradan konu', plain.id, 80, true, '18b-zengin-gecmis-80-gecti');

    // ── 8. G0 passed, and the free plan still ends here: G1 needs seats, seats need M8.
    const main = await openDetail(page, FRESH_SLUG, best.id);
    await main.getByTestId('pipeline-evaluate-gate').click();
    await expect(main.getByTestId('pipeline-gate-result')).toContainText('tanımlı kritik rol yok', { timeout: 30_000 });
    await expect(main.getByTestId('pipeline-evaluate-gate')).toBeEnabled({ timeout: 30_000 });
    await shot(page, '19-g0-gecti-g1-red');
    const refusedG1 = (await decisions(best.id)).at(-1)!;
    expect([refusedG1.gate, refusedG1.passed]).toEqual(['G1', false]);

    await page.goto(`/tr/${FRESH_SLUG}/pipeline/${best.id}/consortium`);
    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: `+ ${CONSORTIUM_ROLES.research}` })).toHaveCount(0);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: FRESH }, select: { pic: true, country: true } });
    const stage = await prisma.opportunity.findUniqueOrThrow({ where: { id: best.id }, select: { stage: true, g0Score: true } });
    dump('SON: taze hesap', { tenant, stage, seats: await prisma.consortiumSeat.count({ where: { tenantId: FRESH } }) });
    expect(stage).toEqual({ stage: 'G0', g0Score: 88 });
    expect(await prisma.consortiumSeat.count({ where: { tenantId: FRESH } })).toBe(0);
  });

  test('on a plan that has M8 with no CORDIS history: an ordinary topic tops out below 70, and no imported rate is a hard stop', async ({ page }) => {
    test.setTimeout(240_000);
    await signInPro(page);
    await saveProfile(page, PRO_SLUG, PRO);

    // ── Every UI-reachable point without a history, on a topic with neither flag. The seats are OPEN, and an OPEN
    //    seat scores nothing (FO-382), so the research and end-user 12 is gone: 30 + 15 + 10 = 55.
    const plain = await createFromForm(page, PRO_SLUG, PRO, 'NG-27 sıradan konu', PLAIN_TOPIC.identifier);
    await openConsortium(page, PRO_SLUG, plain.id);
    await addSeat(page, plain.id, 'research');
    await addSeat(page, plain.id, 'end_user');
    const plainG0 = await runG0(page, PRO_SLUG, plain.id);
    dump('G0 tıklandı, sıradan konu, koltuklu', plainG0);
    await shot(page, '15-siradan-konu-55-red');
    expect(plainG0.passed).toBe(false);
    expect(storedScore(plainG0.inputs)).toBe(55);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: plain.id } })).g0Score).toBe(55);

    // ── The same user on a topic the platform has imported no base rate for.
    const noStat = await createFromForm(page, PRO_SLUG, PRO, 'NG-27 oransız konu', NO_STAT_TOPIC.identifier);
    await openConsortium(page, PRO_SLUG, noStat.id);
    await addSeat(page, noStat.id, 'research');
    await addSeat(page, noStat.id, 'end_user');
    const noStatG0 = await runG0(page, PRO_SLUG, noStat.id);
    dump('G0 tıklandı, başarı oranı içe aktarılmamış konu, koltuklu', noStatG0);
    await shot(page, '16-oransiz-konu-red');
    expect(noStatG0.passed).toBe(false);
    // Only the base-rate rule and the composite stand in the way. The OPEN seats score nothing (FO-382),
    // so the research and end-user 12 is gone: 30 + 10 + 8 = 48.
    expect(storedScore(noStatG0.inputs)).toBe(48);
    expect(noStatG0.banner).toContain('Başarı taban oranı %0; asgari eşik %8');
  });
});

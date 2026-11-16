/**
 * FO-396 step 2 — the EU register answer beside the PIC field on Kurumsal Profil, by real clicks.
 *
 * The register check (src/lib/pic-registry.ts) goes to a loopback stub started here, never to the
 * real EU site (playwright.config.ts points PIC_REGISTRY_URL at 127.0.0.1). Each PIC is typed into
 * the form and saved; the save asks the stub, stores `Tenant.picRegistryStatus` and rescores G0.
 *
 * The four states (FO-394 §3), on the FO-394 reference topic (alignment 80, base rate 18 %, TR,
 * 4 M EUR, partner, two INVITED seats):
 *   (a) history   — the PIC has CORDIS participations: confirmed by name, standard basis, 59,88 NO_GO.
 *   (b) FOUND     — no CORDIS record, the register knows it: no-history grant, 77,11 GO.
 *   (c) NOT_FOUND — the register does not know it: no grant, 57,83 NO_GO; the save is not refused.
 *   (d) UNKNOWN   — the register did not answer (HTTP 503): no grant, 57,83 NO_GO.
 * Every state is photographed in TR and EN, and the G0 card keeps its "iç ön değerlendirme" label.
 *
 * Every row read back is printed with a [FO-396 DB] prefix; that output is the evidence.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { computeG0ForOpportunity } from '../../src/lib/scoring/g0-compute';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';

const TENANT = 'fo396ui-tenant';
const WORKSPACE_ID = 'fo396ui-workspace';
const SLUG = 'fo396ui';
const OWNER = { id: 'fo396ui-owner', email: 'fo396ui-owner@profile.test' };
const OPP_ID = 'fo396ui-partner-opportunity';
const TOPIC_ID = 'fo396ui-topic';

/** (a) known to CORDIS with one coordination and two collaborators. */
const PIC_HISTORY = '987654411';
const ORG_NAME = 'FO396 UI Teknoloji Enstitüsü';
/** (b)(c)(d): no CORDIS row; the stub answers each one differently. */
const PIC_FOUND = '987654412';
const PIC_NOT_FOUND = '987654413';
const PIC_UNKNOWN = '987654414';

const SHOTS = shotsDir('FO-396-screenshots');

function dump(step: string, value: unknown) {
  console.log(`[FO-396 DB] ${step}: ${JSON.stringify(value)}`);
}

// ── The loopback register stub ─────────────────────────────────────────────────────────────────
const asked: string[] = [];
let stub: http.Server | null = null;

function startRegistryStub(port: number) {
  return new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pic = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('pic') ?? '';
      asked.push(pic);
      if (pic === PIC_UNKNOWN) {
        res.writeHead(503, { 'content-type': 'text/plain' }).end('unavailable');
        return;
      }
      // The register's shape: a named profile is FOUND; an empty legalName is "no such organisation".
      const legalName = pic === PIC_NOT_FOUND ? '' : `Registered org ${pic}`;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ publicOrganizationData: { legalName } }));
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// ── Fixture: the FO-394 reference world, on its own tenant and user (own PIC rate limit) ────────
async function teardown() {
  await withSystemScope('platform-admin', 'e2e.fo396-ui.teardown', async (tx) => {
    await tx.gateDecision.deleteMany({ where: { opportunityId: 'fo396ui-partner-opportunity' } });
    await tx.consortiumSeat.deleteMany({ where: { opportunityId: 'fo396ui-partner-opportunity' } });
    await tx.topicMatch.deleteMany({ where: { topicId: 'fo396ui-topic' } });
    await tx.opportunity.deleteMany({ where: { id: 'fo396ui-partner-opportunity' } });
    await tx.topicStat.deleteMany({ where: { topicId: 'fo396ui-topic' } });
    await tx.topic.deleteMany({ where: { id: 'fo396ui-topic' } });
    await tx.call.deleteMany({ where: { id: 'fo396ui-call' } });
    await tx.programme.deleteMany({ where: { id: 'fo396ui-programme' } });
    await tx.cordisParticipation.deleteMany({ where: { projectId: 'fo396ui-project' } });
    await tx.cordisProject.deleteMany({ where: { id: 'fo396ui-project' } });
    await tx.cordisOrganization.deleteMany({ where: { organisationId: { in: ['987654411', '987654421', '987654422'] } } });
    await tx.auditEvent.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.moduleState.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.membership.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.subscription.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.tenantProfile.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.workspace.deleteMany({ where: { tenantId: 'fo396ui-tenant' } });
    await tx.user.deleteMany({ where: { id: 'fo396ui-owner' } });
    await tx.tenant.deleteMany({ where: { id: 'fo396ui-tenant' } });
  });
}

async function setup() {
  await teardown();
  const collaborators = ['987654421', '987654422'];
  await withSystemScope('platform-admin', 'e2e.fo396-ui.setup', async (tx) => {
    await tx.tenant.create({ data: { id: TENANT, name: 'fo396 ui e2e', slug: TENANT, country: 'TR', orgType: 'SME' } });
    await tx.subscription.create({ data: { tenantId: TENANT, planId: 'ultra', status: 'ACTIVE' } });
    await tx.workspace.create({ data: { id: WORKSPACE_ID, tenantId: TENANT, name: 'fo396 ui e2e', slug: SLUG } });
    // FIXTURE: the pipeline (M5) and consortium (M8) modules, so the G0 card can be opened.
    await tx.moduleState.createMany({
      data: ['M5', 'M8'].map((moduleId) => ({ tenantId: TENANT, moduleId, status: 'ON' as const, changedBy: 'fo396ui-e2e' })),
    });
    await tx.tenantProfile.create({
      data: { tenantId: TENANT, capabilities: 'Grid flexibility pilots', keywords: ['grid flexibility'], trlRange: [4, 7], naceCodes: [], preferredRoles: [] },
    });
    await tx.user.create({ data: { id: OWNER.id, email: OWNER.email, name: OWNER.id, locale: 'tr' } });
    await tx.membership.create({ data: { tenantId: TENANT, userId: OWNER.id, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] } });

    await tx.cordisOrganization.create({ data: { organisationId: PIC_HISTORY, name: ORG_NAME, city: 'Ankara', country: 'TR' } });
    for (const organisationId of collaborators) {
      await tx.cordisOrganization.create({ data: { organisationId, name: `FO396 UI collaborator ${organisationId}`, country: 'DE' } });
    }
    await tx.cordisProject.create({ data: { id: 'fo396ui-project', title: 'FO396 UI project', framework: 'HORIZON', masterCall: 'HORIZON-FO396UI-2026-01' } });
    await tx.cordisParticipation.create({ data: { projectId: 'fo396ui-project', organisationId: PIC_HISTORY, role: 'coordinator' } });
    for (const organisationId of collaborators) {
      await tx.cordisParticipation.create({ data: { projectId: 'fo396ui-project', organisationId, role: 'participant' } });
    }

    await tx.programme.create({ data: { id: 'fo396ui-programme', name: 'FO396 UI Programme', sourceKey: 'fo396ui-e2e' } });
    await tx.call.create({
      data: { id: 'fo396ui-call', programmeId: 'fo396ui-programme', callIdentifier: 'HORIZON-FO396UI-2026-01', title: 'FO396 UI Call', currency: 'EUR' },
    });
    await tx.topic.create({
      data: {
        id: TOPIC_ID,
        callId: 'fo396ui-call',
        identifier: 'HORIZON-FO396UI-2026-01-D1-01',
        title: 'FO396 UI Topic',
        typeOfAction: 'IA',
        isLumpSum: false,
        isTwoStage: false,
        budgetPerProjectCents: BigInt(400_000_000),
        deadlines: [{ stage: 1, at: '2026-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
        eligibility: {},
        keywords: ['grid flexibility'],
      },
    });
    await tx.topicMatch.create({ data: { tenantId: TENANT, topicId: TOPIC_ID, fitScore: 80, breakdown: { source: 'fo396ui-e2e/k1' } } });
    await tx.topicStat.create({
      data: { topicId: TOPIC_ID, topicPrefix: 'HORIZON-FO396UI-2026-01-D1', country: 'TR', proposals: 100, funded: 18, successRate: 18, source: 'fo396ui-e2e' },
    });
    await tx.opportunity.create({
      data: { id: OPP_ID, tenantId: TENANT, workspaceId: WORKSPACE_ID, title: 'FO396 UI ortak fırsatı', topicId: TOPIC_ID, stage: 'G0', status: 'ACTIVE', intendedRole: 'partner' },
    });
    for (const roleKey of ['research', 'end_user']) {
      await tx.consortiumSeat.create({ data: { tenantId: TENANT, opportunityId: OPP_ID, roleKey, status: 'INVITED' } });
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
const profileUrl = (locale: 'tr' | 'en') => `/${locale}/${SLUG}/settings/profile`;

async function openProfile(page: Page, locale: 'tr' | 'en') {
  await page.goto(profileUrl(locale));
  await expectHydrated(page.getByTestId('tenant-pic-input'));
}

async function typeAndSave(page: Page, pic: string) {
  await page.getByTestId('tenant-pic-input').fill(pic);
  await page.getByRole('button', { name: 'Profili Kaydet' }).click();
}

async function tenantRow() {
  return prisma.tenant.findUniqueOrThrow({
    where: { id: TENANT },
    select: { pic: true, picRegistryStatus: true, picRegistryCheckedAt: true },
  });
}

async function g0() {
  const c = await withTenant(TENANT, (tx) => computeG0ForOpportunity(tx, TENANT, OPP_ID));
  const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: OPP_ID }, select: { g0Score: true } });
  return {
    score: c?.score ?? null,
    decision: c?.decision ?? null,
    scoringBasis: c?.scoringBasis ?? null,
    denominator: c?.denominator ?? null,
    filledSeats: c?.filledSeats ?? null,
    scoringVersion: c?.scoringVersion ?? null,
    storedOpportunityG0: stored.g0Score,
  };
}

/** The pipeline G0 card: the score the reader sees, and the label that says it is not an official score. */
async function g0Card(page: Page, locale: 'tr' | 'en', name: string) {
  await page.goto(`/${locale}/${SLUG}/pipeline/${OPP_ID}`);
  const card = page.getByTestId('pipeline-g0-score');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(locale === 'tr' ? 'İç ön değerlendirme' : /internal pre-assessment/i);
  const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
  dump(`${name} G0 kartı (${locale})`, text);
  await card.screenshot({ path: `${SHOTS}/${name}-g0-${locale}.png` });
  return text;
}

async function shotPic(page: Page, name: string, locale: 'tr' | 'en') {
  await page.getByTestId('tenant-pic-setting').screenshot({ path: `${SHOTS}/${name}-profil-${locale}.png` });
}

async function waitStatus(expected: string) {
  await expect.poll(async () => (await tenantRow()).picRegistryStatus, { timeout: 30_000 }).toBe(expected);
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────────
test.describe('FO-396 — EU register answer on Kurumsal Profil', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const port = Number(process.env.E2E_PIC_REGISTRY_STUB_PORT);
    expect(port, 'playwright.config.ts sets E2E_PIC_REGISTRY_STUB_PORT').toBeGreaterThan(0);
    stub = await startRegistryStub(port);
    dump('stub', { listening: (stub.address() as AddressInfo).port });
    await setup();
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => (stub ? stub.close(() => resolve()) : resolve()));
    dump('stub istekleri', asked);
    if (process.env.FO396_KEEP !== '1') await teardown();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });
  });

  test('(a) a PIC with CORDIS history: confirmed by name, scored on its history', async ({ page }) => {
    await openProfile(page, 'tr');
    await typeAndSave(page, PIC_HISTORY);
    const confirm = page.getByTestId('tenant-pic-confirm');
    await expect(confirm).toContainText(ORG_NAME);
    await confirm.getByTestId('tenant-pic-confirm-yes').click();
    const fb = page.getByTestId('tenant-pic-feedback');
    await expect(fb).toContainText(`CORDIS kaydı: ${ORG_NAME}`);
    await expect(page.getByTestId('tenant-pic-registry')).toHaveCount(0);
    await waitStatus('FOUND');
    const row = await tenantRow();
    const score = await g0();
    dump('(a) tenant', row);
    dump('(a) G0', score);
    expect(row.pic).toBe(PIC_HISTORY);
    expect(score.scoringBasis).toBe('standard');
    expect(score.score).toBe(59.88);
    expect(score.decision).toBe('NO_GO');
    await shotPic(page, 'a-gecmisli', 'tr');
    await g0Card(page, 'tr', 'a-gecmisli');

    await openProfile(page, 'en');
    await expect(page.getByTestId('tenant-pic-feedback')).toContainText(`CORDIS record: ${ORG_NAME}`);
    await shotPic(page, 'a-gecmisli', 'en');
    await g0Card(page, 'en', 'a-gecmisli');
  });

  test('(b) registered, no history: FOUND, the new-organisation allowance applies', async ({ page }) => {
    await openProfile(page, 'tr');
    await typeAndSave(page, PIC_FOUND);
    const line = page.getByTestId('tenant-pic-registry');
    await expect(line).toHaveAttribute('data-status', 'FOUND', { timeout: 30_000 });
    await expect(line).toContainText('AB katılımcı kaydında bulundu');
    const row = await tenantRow();
    const score = await g0();
    dump('(b) tenant', row);
    dump('(b) G0', score);
    expect(row).toMatchObject({ pic: PIC_FOUND, picRegistryStatus: 'FOUND' });
    expect(score.scoringBasis).toBe('no_history_evidence');
    expect(score.denominator).toBe(75);
    expect(score.score).toBe(77.11);
    expect(score.decision).toBe('GO');
    await shotPic(page, 'b-kayitli-gecmissiz', 'tr');
    await g0Card(page, 'tr', 'b-kayitli-gecmissiz');

    await openProfile(page, 'en');
    await expect(page.getByTestId('tenant-pic-registry')).toContainText('Found in the EU Participant Register');
    await shotPic(page, 'b-kayitli-gecmissiz', 'en');
    await g0Card(page, 'en', 'b-kayitli-gecmissiz');
  });

  test('(c) not in the register: saved anyway, NOT_FOUND, no allowance', async ({ page }) => {
    await openProfile(page, 'tr');
    await typeAndSave(page, PIC_NOT_FOUND);
    const line = page.getByTestId('tenant-pic-registry');
    await expect(line).toHaveAttribute('data-status', 'NOT_FOUND', { timeout: 30_000 });
    await expect(line).toContainText('AB katılımcı kaydında bulunamadı');
    await expect(page.getByTestId('tenant-pic-input')).toHaveValue(PIC_NOT_FOUND);
    const row = await tenantRow();
    const score = await g0();
    dump('(c) tenant', row);
    dump('(c) G0', score);
    expect(row).toMatchObject({ pic: PIC_NOT_FOUND, picRegistryStatus: 'NOT_FOUND' });
    expect(score.scoringBasis).toBe('standard');
    expect(score.score).toBe(57.83);
    expect(score.decision).toBe('NO_GO');
    await shotPic(page, 'c-kayitsiz', 'tr');
    // 390 px phone: the warning wraps under its icon, nothing is cut off.
    await page.setViewportSize({ width: 390, height: 844 });
    const lineBox = await line.boundingBox();
    expect(lineBox && lineBox.x + lineBox.width).toBeLessThanOrEqual(390);
    await shotPic(page, 'c-kayitsiz-390', 'tr');
    await page.setViewportSize({ width: 1280, height: 720 });
    await g0Card(page, 'tr', 'c-kayitsiz');

    await openProfile(page, 'en');
    await expect(page.getByTestId('tenant-pic-registry')).toContainText('was not found in the EU Participant Register');
    await shotPic(page, 'c-kayitsiz', 'en');
    await g0Card(page, 'en', 'c-kayitsiz');
  });

  test('(d) the register did not answer: UNKNOWN, no allowance until it is checked', async ({ page }) => {
    await openProfile(page, 'tr');
    await typeAndSave(page, PIC_UNKNOWN);
    const line = page.getByTestId('tenant-pic-registry');
    await expect(line).toHaveAttribute('data-status', 'UNKNOWN', { timeout: 30_000 });
    await expect(line).toContainText('doğrulanamadı');
    const row = await tenantRow();
    const score = await g0();
    dump('(d) tenant', row);
    dump('(d) G0', score);
    expect(row).toMatchObject({ pic: PIC_UNKNOWN, picRegistryStatus: 'UNKNOWN' });
    expect(score.scoringBasis).toBe('standard');
    expect(score.score).toBe(57.83);
    expect(score.decision).toBe('NO_GO');
    await shotPic(page, 'd-ulasilamadi', 'tr');
    await g0Card(page, 'tr', 'd-ulasilamadi');

    await openProfile(page, 'en');
    await expect(page.getByTestId('tenant-pic-registry')).toContainText('could not be checked');
    await shotPic(page, 'd-ulasilamadi', 'en');
    await g0Card(page, 'en', 'd-ulasilamadi');

    // The stub was asked once per saved PIC, and only for those four numbers.
    expect(asked).toEqual([PIC_HISTORY, PIC_FOUND, PIC_NOT_FOUND, PIC_UNKNOWN]);
  });
});

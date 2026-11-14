import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — the free expert pre-registrations on the M8
 * matching page. Before this card no M8 query read them: 0 matches.
 *
 * A real browser over a real database: a verified expert whose programme and
 * role fit the open research seat appears under it; a pending registration with
 * the same profile does not. Provinces tell the two apart on the page (the card
 * is pseudonymous: no name, no contact). The expert rows are written over the
 * owning handle and removed again in afterAll.
 */

const SHOTS = shotsDir('NG-52-evidence');
const TENANT = 'demo-tenant';
const WORKSPACE = 'main';
const OPP = 'ng52-e2e-opp';
const RESEARCH_SEAT = 'ng52-e2e-seat-research';
const INDUSTRY_SEAT = 'ng52-e2e-seat-industry';
const URL = `/tr/${WORKSPACE}/opportunities/${OPP}/matching`;
const SEAT = { id: 'demo-user-alice', email: 'alice@fabrika.test', tenantId: TENANT, role: 'PIPELINE_MANAGER' };
const TOPIC_IDENTIFIER = 'HORIZON-CL5-2026-D4-01';
const VERIFIED = 'ng52-e2e-expert-verified';
const PENDING = 'ng52-e2e-expert-pending';

async function rollback() {
  await prisma.consortiumSeat.deleteMany({ where: { opportunityId: OPP } });
  await prisma.opportunity.deleteMany({ where: { id: OPP } });
  await prisma.expertPreRegistration.deleteMany({ where: { id: { in: [VERIFIED, PENDING] } } });
}

async function seed() {
  await rollback();
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M8' } },
    create: { tenantId: TENANT, moduleId: 'M8', status: 'ON' },
    update: { status: 'ON' },
  });
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { tenantId: TENANT, slug: WORKSPACE }, select: { id: true } });
  const topic = await prisma.topic.findFirstOrThrow({ where: { identifier: TOPIC_IDENTIFIER }, select: { id: true } });
  await prisma.opportunity.create({
    data: { id: OPP, tenantId: TENANT, workspaceId: workspace.id, topicId: topic.id, title: 'NG-52 e2e — expert pool', stage: 'G1', status: 'ACTIVE' },
  });
  await prisma.consortiumSeat.createMany({
    data: [
      { id: RESEARCH_SEAT, tenantId: TENANT, opportunityId: OPP, roleKey: 'research', status: 'OPEN' },
      { id: INDUSTRY_SEAT, tenantId: TENANT, opportunityId: OPP, roleKey: 'industry', status: 'OPEN' },
    ],
  });
  const now = new Date();
  const expert = (id: string, province: string, status: string) => ({
    id,
    fullName: 'NG-52 e2e probe',
    email: `${id}@ng52.test`,
    province,
    isFreelancer: true,
    expertiseAreas: ['energy'],
    roles: ['researcher'],
    programmes: ['horizon-europe-h2020'],
    languages: ['tr', 'en'],
    kvkkAcceptedAt: now,
    visibilityConsentAt: now,
    locale: 'tr',
    status,
    emailVerifiedAt: status === 'verified' ? now : null,
  });
  await prisma.expertPreRegistration.createMany({
    data: [expert(VERIFIED, '81', 'verified'), expert(PENDING, '80', 'pending')],
  });
}

test.describe('M8 expert pool (NG-52)', () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    if (process.env.NG52_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('a verified pre-registration is a candidate of the open research seat, a pending one is not', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 500) serverErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    await signInAs(page, SEAT);
    await page.goto(URL);
    await page.waitForURL(`**${URL}`, { timeout: 30_000 });

    const research = page.getByTestId('m8-expert-pool-research');
    await expect(research).toBeVisible();
    const cards = research.getByTestId('m8-expert-candidate');
    // Match count > 0: the verified expert (Düzce, plate 81) is there.
    await expect(cards.filter({ hasText: 'Düzce' })).toHaveCount(1);
    await expect(research).toContainText('Horizon Europe / H2020');
    await expect(research).toContainText('Araştırmacı');
    // The pending registration (Osmaniye, plate 80) is not, and nothing personal is shown.
    await expect(research).not.toContainText('Osmaniye');
    await expect(research).not.toContainText('NG-52 e2e probe');
    await expect(research).not.toContainText('@ng52.test');

    // An organisation-type seat gets no expert.
    const industry = page.getByTestId('m8-expert-pool-industry');
    await expect(industry.getByTestId('m8-expert-candidate')).toHaveCount(0);

    await research.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/ng52-expert-pool-matching.png`, fullPage: true });
    expect(serverErrors).toEqual([]);
  });
});

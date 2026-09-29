import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * M8 "Aday Bul" — a real browser, a real database, a real click.
 *
 * The bug this covers could not be caught anywhere else: the unit test replaced
 * `@/lib/db` with a mock, so `prisma.organization` — a model that is not in
 * prisma/schema.prisma — resolved happily in the suite and threw a 500 in the
 * product. Nothing here is stubbed.
 *
 * The fixture is inline rather than a script under scripts/ because this card's
 * scope does not include that directory.
 */

const SHOTS = shotsDir('TASK-MTR4CH9IDK4D7-screenshots');
const TENANT = 'demo-tenant';
const WORKSPACE = 'main';
const OPP = 'm8-e2e-opp';
const OPEN_SEAT = 'm8-e2e-seat-open';
const CONFIRMED_SEAT = 'm8-e2e-seat-confirmed';
/** A seat of its own for the builder surface — see the note on that test. */
const BUILDER_SEAT = 'm8-e2e-seat-widening';
const URL = `/tr/${WORKSPACE}/opportunities/${OPP}/matching`;
const EMAIL = 'alice@fabrika.test';

/** CORDIS PICs the fixture introduces. All are removed again in afterAll. */
const PIC = {
  a: 'M8E2E-PIC-A',
  b: 'M8E2E-PIC-B',
  c: 'M8E2E-PIC-C',
  seated: 'M8E2E-PIC-SEATED',
};

/**
 * CORDIS projects of the fixture's own, all under the HORIZON-CL5-2026 call
 * prefix the opportunity's topic belongs to — that prefix, read through
 * `CordisProjectTopic.topicCode`, is how both scorers find "experience on this
 * topic". The spec used to borrow `SAMPLE-0001/0008/0011`, which only
 * `scripts/esr-calibration.ts` creates; `prisma/seed.ts` does not, so on the CI
 * database the participations below failed on `CordisParticipation_projectId_fkey`
 * (TASK-MULU828HTNN4N). Removed again in afterAll; the participations and topic
 * rows cascade with them.
 */
const PROJECTS = ['M8E2E-PROJ-1', 'M8E2E-PROJ-2', 'M8E2E-PROJ-3'];
const TOPIC_IDENTIFIER = 'HORIZON-CL5-2026-D4-01';

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
  const topic = await prisma.topic.findFirstOrThrow({
    where: { identifier: TOPIC_IDENTIFIER },
    select: { id: true },
  });

  await prisma.opportunity.create({
    data: {
      id: OPP,
      tenantId: TENANT,
      workspaceId: workspace.id,
      topicId: topic.id,
      title: 'M8 e2e — grid flexibility consortium',
      stage: 'G1',
      status: 'ACTIVE',
    },
  });

  await prisma.consortiumSeat.createMany({
    data: [
      {
        id: CONFIRMED_SEAT,
        tenantId: TENANT,
        opportunityId: OPP,
        roleKey: 'industry',
        status: 'CONFIRMED',
        organizationId: PIC.seated,
      },
      { id: OPEN_SEAT, tenantId: TENANT, opportunityId: OPP, roleKey: 'research', status: 'OPEN' },
      { id: BUILDER_SEAT, tenantId: TENANT, opportunityId: OPP, roleKey: 'widening', status: 'OPEN' },
    ],
  });

  await prisma.cordisProject.createMany({
    data: PROJECTS.map((id, i) => ({
      id,
      acronym: `M8E2E${i + 1}`,
      title: `M8E2E project ${i + 1}`,
      framework: 'HORIZON',
    })),
  });
  await prisma.cordisProjectTopic.createMany({
    data: PROJECTS.map((projectId) => ({ projectId, topicCode: TOPIC_IDENTIFIER })),
  });

  await prisma.cordisOrganization.createMany({
    data: [
      { organisationId: PIC.a, name: 'M8E2E Institute of Grids', country: 'FR', activityType: 'REC', sme: false },
      { organisationId: PIC.b, name: 'M8E2E Anadolu Enerji', country: 'TR', activityType: 'PRC', sme: true },
      { organisationId: PIC.c, name: 'M8E2E Universidad del Sur', country: 'ES', activityType: 'HES', sme: false },
      { organisationId: PIC.seated, name: 'M8E2E Nordwerk GmbH', country: 'DE', activityType: 'PRC', sme: false },
    ],
  });

  // PIC.a is on all three projects and coordinated one; PIC.b on two; PIC.c on
  // one. The seated partner shares two of them, which is the collaboration
  // signal.
  await prisma.cordisParticipation.createMany({
    data: [
      { projectId: PROJECTS[0]!, organisationId: PIC.a, role: 'coordinator' },
      { projectId: PROJECTS[1]!, organisationId: PIC.a, role: 'participant' },
      { projectId: PROJECTS[2]!, organisationId: PIC.a, role: 'participant' },
      { projectId: PROJECTS[0]!, organisationId: PIC.b, role: 'participant' },
      { projectId: PROJECTS[1]!, organisationId: PIC.b, role: 'participant' },
      { projectId: PROJECTS[2]!, organisationId: PIC.c, role: 'participant' },
      { projectId: PROJECTS[0]!, organisationId: PIC.seated, role: 'participant' },
      { projectId: PROJECTS[1]!, organisationId: PIC.seated, role: 'participant' },
    ],
  });

  // Edges are stored once under `orgA < orgB`, as the importer writes them.
  const edge = (x: string, y: string, count: number) =>
    x < y
      ? { orgA: x, orgB: y, sharedProjectCount: count }
      : { orgA: y, orgB: x, sharedProjectCount: count };
  await prisma.cordisCoParticipation.createMany({
    data: [edge(PIC.a, PIC.seated, 2), edge(PIC.b, PIC.seated, 1), edge(PIC.a, PIC.b, 2)],
  });

  await prisma.cordisPartnerProfile.createMany({
    data: [
      { organisationId: PIC.a, name: 'M8E2E Institute of Grids', country: 'FR', sme: false, totalProjects: 24, coordinatorProjects: 6 },
      { organisationId: PIC.b, name: 'M8E2E Anadolu Enerji', country: 'TR', sme: true, totalProjects: 11, coordinatorProjects: 1 },
      { organisationId: PIC.c, name: 'M8E2E Universidad del Sur', country: 'ES', sme: false, totalProjects: 7, coordinatorProjects: 0 },
    ],
  });

  // A warm relationship on PIC.b, so the warmth dimension is exercised too.
  await prisma.relationship.create({
    data: {
      id: 'm8-e2e-rel',
      tenantId: TENANT,
      organizationId: PIC.b,
      kind: 'partner',
      ownerUserId: 'demo-user-alice',
      warmth: 'hot',
    },
  });
}

async function rollback() {
  const pics = Object.values(PIC);
  await prisma.seatCandidate.deleteMany({
    where: { seatId: { in: [OPEN_SEAT, CONFIRMED_SEAT, BUILDER_SEAT] } },
  });
  await prisma.consortiumSeat.deleteMany({ where: { opportunityId: OPP } });
  await prisma.opportunity.deleteMany({ where: { id: OPP } });
  await prisma.relationship.deleteMany({ where: { id: 'm8-e2e-rel' } });
  await prisma.cordisParticipation.deleteMany({ where: { organisationId: { in: pics } } });
  await prisma.cordisCoParticipation.deleteMany({ where: { OR: [{ orgA: { in: pics } }, { orgB: { in: pics } }] } });
  await prisma.cordisPartnerProfile.deleteMany({ where: { organisationId: { in: pics } } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: pics } } });
  await prisma.cordisProject.deleteMany({ where: { id: { in: PROJECTS } } });
}

test.describe('M8 consortium matching', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.M8_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  /**
   * Next 16 always mounts `<nextjs-portal>` for its dev tools, so its presence
   * proves nothing. The error overlay puts the thrown class name inside that
   * shadow root, which is what is actually checked here.
   */
  const expectNoRuntimeError = async (page: import('@playwright/test').Page) => {
    const overlay = await page.evaluate(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot;
      if (!root) return '';
      // The shadow root also carries the overlay's stylesheet; only the rendered
      // text is of interest.
      return Array.from(root.querySelectorAll('body, div'))
        .map((el) => el.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ');
    });
    for (const marker of [
      'PrismaClientValidationError',
      'Unhandled Runtime Error',
      'Server Error',
      'Unknown field',
      'Unknown argument',
    ]) {
      expect(overlay, `Next error overlay reported: ${overlay.slice(0, 400)}`).not.toContain(marker);
    }
  };

  const signIn = async (page: import('@playwright/test').Page) => {
    // The cookie banner renders as a full-screen `inset-0` alertdialog and
    // swallows pointer events; a returning user is in this state already.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(URL)}`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${URL}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
  };

  test('the page renders and "Aday Bul" produces ranked candidates', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 500) serverErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });

    await signIn(page);

    // 1. The page itself. It used to die here on
    // `include: { seats: { include: { organization: true } } }`.
    await expect(page.getByRole('heading', { name: 'Konsorsiyum Rol Matrisi' })).toBeVisible();
    // The document is streamed and always 200 in dev, so the overlay — not the
    // status code — is what says whether the render threw.
    await expectNoRuntimeError(page);

    // Both seats start empty, and the empty state says so rather than rendering
    // nothing at all.
    const seatCard = page.getByTestId('m8-seat-research');
    await expect(seatCard).toContainText('Bu koltuk için henüz aday hesaplanmadı.');
    await expect(page.getByTestId('m8-seat-industry')).toContainText(
      'Bu koltuk için henüz aday hesaplanmadı.',
    );
    // The confirmed seat names the partner it already holds.
    await expect(page.getByTestId('m8-seat-industry')).toContainText('M8E2E Nordwerk GmbH');
    await page.screenshot({ path: `${SHOTS}/02-after-page-renders.png`, fullPage: true });

    // 2. The click.
    await seatCard.getByRole('button', { name: 'Aday Bul' }).click();

    const table = seatCard.locator('table');
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expectNoRuntimeError(page);

    // 3. The ranking. PIC.a coordinated one of the three projects and shares two
    // with the seated partner, so it must outrank PIC.b and PIC.c.
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('M8E2E Institute of Grids');
    await expect(rows.nth(0)).toContainText('#1');

    // The seated partner is already on the consortium and is not offered again.
    await expect(table).not.toContainText('M8E2E Nordwerk GmbH');

    await page.screenshot({ path: `${SHOTS}/03-after-candidates.png`, fullPage: true });

    // 4. The breakdown is reachable without a mouse hover.
    const details = rows.nth(0).locator('details');
    await details.locator('summary').click();
    await expect(details).toContainText('Konu deneyimi');
    await page.screenshot({ path: `${SHOTS}/04-breakdown-expanded.png`, fullPage: true });

    // 5. What was actually written, asserted here rather than in a later test:
    // the consortium builder writes the *same* seat's candidates with its own
    // scale, so a separate test would read whichever surface ran last.
    const written = await prisma.seatCandidate.findMany({
      where: { seatId: OPEN_SEAT },
      orderBy: { rank: 'asc' },
      select: { tenantId: true, organizationId: true, rank: true, score: true, breakdown: true },
    });
    expect(written.length).toBe(3);
    for (const row of written) expect(row.tenantId).toBe(TENANT);
    expect(written[0]?.organizationId).toBe(PIC.a);
    // Every dimension is persisted, so the UI can show reasoning rather than a
    // bare number (CLAUDE.md §7 — a shown statistic is backed by a record).
    expect(Object.keys(written[0]?.breakdown as object).sort()).toEqual([
      'centrality',
      'collabHistory',
      'geographicBalance',
      'relationshipWarmth',
      'rivalRisk',
      'topicExperience',
    ]);

    expect(serverErrors, `server errors during the run:\n${serverErrors.join('\n')}`).toEqual([]);
  });

  /**
   * The second M8 surface. It has its own scorer (src/lib/scoring/consortium.ts)
   * behind the same "Aday Bul" label, and it was broken the same way — except
   * that this page wraps its queries in try/catch, so the failure showed up as a
   * silent demo fallback rather than an error screen.
   *
   * It is pointed at a seat of its own on purpose. Both surfaces write the same
   * `SeatCandidate` rows for a seat, on different scales (0-100 here, 0-10
   * there), so sharing a seat would mean this test asserted on whichever button
   * was pressed last. That collision is a real product defect, recorded in the
   * result report — this test simply refuses to depend on it.
   */
  test('the pipeline consortium builder finds candidates too', async ({ page }) => {
    const consortiumUrl = `/tr/${WORKSPACE}/pipeline/${OPP}/consortium`;
    const serverErrors: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 500) serverErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(consortiumUrl)}`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${consortiumUrl}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // The real opportunity, not the DEMO_OPPORTUNITIES fallback the swallowed
    // error used to produce.
    await expect(page.getByText('M8 e2e — grid flexibility consortium')).toBeVisible();

    const builderSeat = page.getByTestId('m8-builder-seat-widening');
    await builderSeat.getByRole('button', { name: 'Aday Bul' }).click();

    await expect(page.getByText('M8E2E Institute of Grids').first()).toBeVisible({ timeout: 30_000 });
    await expectNoRuntimeError(page);
    await page.screenshot({ path: `${SHOTS}/05-consortium-builder.png`, fullPage: true });

    // This surface's own scorer ran: its breakdown keys are not the matching
    // page's, so the rows cannot have come from the earlier test.
    await expect
      .poll(async () => (await prisma.seatCandidate.count({ where: { seatId: BUILDER_SEAT } })), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    const written = await prisma.seatCandidate.findMany({
      where: { seatId: BUILDER_SEAT },
      orderBy: { rank: 'asc' },
      select: { tenantId: true, breakdown: true },
    });
    for (const row of written) expect(row.tenantId).toBe(TENANT);
    expect(Object.keys(written[0]?.breakdown as object).sort()).toEqual([
      'countryDiversity',
      'networkCentrality',
      'smeBonus',
      'topicExperience',
      'total',
      'warmthBonus',
    ]);

    expect(serverErrors, `server errors:\n${serverErrors.join('\n')}`).toEqual([]);
  });

});

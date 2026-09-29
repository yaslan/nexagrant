import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTS6LZOD715WM — a Part B the tenant has not written names nobody.
 *
 * `DEFAULT_PART_B_SECTIONS` used to ship eight sections already attributed to invented
 * people at invented organisations (`Dr. Mehmet Yılmaz` / `Demo SME Consultancy`,
 * `Prof. Klaus Müller` / `Fraunhofer Institute`, `Doç. Dr. Selin Kaya` / `METU TTO`,
 * `Dr. Sofia Rossi` / `Politecnico di Milano`, `Marcus Schmidt` / `Siemens AG`), each
 * carrying a written battery-thermal proposal. Every tenant that opened Part B saw that
 * text as its own, with a page counter reporting pages nobody had written, and could
 * export it to DOCX/PDF over names that had never agreed to anything.
 *
 * Nothing here is stubbed: a real fixture tenant in Postgres, real sign-in, real render,
 * both locales. The fixture is rolled back afterwards, keyed on the fixed ids below.
 */

const SHOTS = shotsDir('TASK-MTS6LZOD715WM-screenshots');

const M11_E2E = {
  email: 'm11-e2e@fabrika.test',
  tenantId: 'm11-e2e-tenant',
  workspaceId: 'm11-e2e-workspace',
  workspaceSlug: 'm11-e2e-ws',
  userId: 'm11-e2e-user',
  opportunityId: 'm11-e2e-opportunity',
} as const;

const APPLICATION_URL = (locale: string) =>
  `/${locale}/${M11_E2E.workspaceSlug}/opportunities/${M11_E2E.opportunityId}/application`;

/** The people and organisations the template used to invent, as the UI rendered them. */
const INVENTED = [
  'Mehmet Yılmaz',
  'Klaus Müller',
  'Selin Kaya',
  'Sofia Rossi',
  'Marcus Schmidt',
  'Demo SME Consultancy',
  'Fraunhofer',
  'METU TTO',
  'Politecnico di Milano',
  'Siemens AG',
];

/** Figures the invented proposal stated as fact. None of them came from a record. */
const INVENTED_FIGURES = ['4.2B', '420,000', '99.2%', 'TRL 7'];

/**
 * The gate is two locks: the plan must grant M11 and the tenant must have switched it on.
 * `ultra` is the plan that grants M11 (src/lib/billing/catalog.ts PLAN_GRANTS).
 */
async function seedFixture() {
  await prisma.tenant.upsert({
    where: { id: M11_E2E.tenantId },
    update: {},
    create: {
      id: M11_E2E.tenantId,
      name: 'M11 E2E',
      slug: 'm11-e2e',
      country: 'TR',
      orgType: 'SME',
    },
  });
  await prisma.workspace.upsert({
    where: { id: M11_E2E.workspaceId },
    update: {},
    create: {
      id: M11_E2E.workspaceId,
      tenantId: M11_E2E.tenantId,
      name: 'M11 E2E',
      slug: M11_E2E.workspaceSlug,
    },
  });
  await prisma.user.upsert({
    where: { id: M11_E2E.userId },
    update: { email: M11_E2E.email },
    create: { id: M11_E2E.userId, email: M11_E2E.email, name: 'M11 E2E Author', locale: 'tr' },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: M11_E2E.tenantId, userId: M11_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [M11_E2E.workspaceId] },
    create: {
      userId: M11_E2E.userId,
      tenantId: M11_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [M11_E2E.workspaceId],
    },
  });
  await prisma.subscription.upsert({
    where: { tenantId: M11_E2E.tenantId },
    update: { planId: 'ultra', status: 'ACTIVE' },
    create: { tenantId: M11_E2E.tenantId, planId: 'ultra', status: 'ACTIVE' },
  });
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: M11_E2E.tenantId, moduleId: 'M11' } },
    update: { status: 'ON' },
    create: {
      tenantId: M11_E2E.tenantId,
      moduleId: 'M11',
      status: 'ON',
      changedBy: 'partb-template-identity-e2e',
    },
  });
  // No ApplicationPart row: this is the state the defect lived in — a tenant opening
  // Part B for the first time, where the template is all the editor has to show.
  await prisma.opportunity.upsert({
    where: { id: M11_E2E.opportunityId },
    update: {},
    create: {
      id: M11_E2E.opportunityId,
      tenantId: M11_E2E.tenantId,
      workspaceId: M11_E2E.workspaceId,
      title: 'M11 E2E — Part B template fixture',
      stage: 'G2',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });
}

async function rollbackFixture() {
  await prisma.opportunity.deleteMany({ where: { id: M11_E2E.opportunityId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: M11_E2E.tenantId } });
  await prisma.subscription.deleteMany({ where: { tenantId: M11_E2E.tenantId } });
  await prisma.membership.deleteMany({ where: { tenantId: M11_E2E.tenantId } });
  await prisma.user.deleteMany({ where: { id: M11_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: M11_E2E.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: M11_E2E.tenantId } });
}

async function signInAndOpenPartB(page: Page, locale: string) {
  const url = APPLICATION_URL(locale);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  const loginPath = locale === 'tr' ? 'giris' : 'login';
  await page.goto(`/${locale}/${loginPath}?callbackUrl=${encodeURIComponent(url)}`);
  await page.locator('input[type="email"]').fill(M11_E2E.email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${url}`, { timeout: 60_000 });
  // The caller asserts on a locator next; that auto-wait is the synchronisation.
  return page.getByRole('main');
}

test.describe('Part B editor — an unwritten section is shown as unwritten', () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    await rollbackFixture();
    await prisma.$disconnect();
  });

  for (const [locale, messages] of [
    ['tr', trMessages],
    ['en', enMessages],
  ] as const) {
    test(`${locale}: no invented author, organisation or prose reaches the screen`, async ({
      page,
    }) => {
      const app = await signInAndOpenPartB(page, locale);

      const unassigned = app.getByText(messages.PartBEditor.leadUnassigned);
      await expect(unassigned.first()).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/partb-editor-${locale}.png` });
      // The section tree sits below the fold; it is where the eight invented leads used to be.
      await page.setViewportSize({ width: 1280, height: 1700 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/partb-section-tree-${locale}.png` });

      const body = await page.locator('body').innerText();
      for (const invented of [...INVENTED, ...INVENTED_FIGURES]) {
        expect(body, `Part B still shows "${invented}"`).not.toContain(invented);
      }

      // All eight sections in the list are unowned, and the active section says so too.
      expect(await unassigned.count()).toBeGreaterThanOrEqual(9);

      // An empty section reports zero words, not the invented proposal's page count.
      expect(body).toMatch(/\(0 (Kelime|words)\)/);
    });
  }
});

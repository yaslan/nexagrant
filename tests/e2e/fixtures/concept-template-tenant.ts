import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';

/**
 * Two tenants for `tests/e2e/concept-template-tenant-isolation.spec.ts`.
 *
 * Tenant A is the one the browser signs in as. Tenant B exists only to own a
 * `ConceptTemplate` whose `key` is `generic` — the key the M2 page falls back to
 * when an opportunity has no note yet. That lookup used to be
 * `prisma.conceptTemplate.findFirst({ where: { key: 'generic' } })` with no
 * tenant arm, so whichever `generic` row Postgres returned first was handed to
 * whoever opened the page (TASK-MTVTU103F11XJ).
 *
 * The platform `generic` row is the seeded one (`tenantId` NULL) and is left
 * alone; B's row carries a name the spec can see in the rendered editor, so the
 * assertion is about *which* template reached the browser rather than about the
 * page merely rendering.
 *
 * M2 is `ON` and the plan is `basic`, which the catalogue grants M2 — so nothing
 * here can pass or fail for a gate reason.
 */
export const CT_TENANT_A = 'ct-e2e-tenant-a';
export const CT_TENANT_B = 'ct-e2e-tenant-b';
export const CT_WORKSPACE_ID = 'ct-e2e-workspace-a';
export const CT_WORKSPACE = 'ct-e2e-a';
export const CT_USER_ID = 'ct-e2e-user-a';
export const CT_EMAIL = 'ct-e2e-a@fabrika.test';
export const CT_OPPORTUNITY_ID = 'ct-e2e-opportunity-a';

/** The name only tenant B's template carries. Seeing it in A's browser is the leak. */
export const CT_FOREIGN_TEMPLATE_NAME = 'Tenant B Private Generic Template';
export const CT_FOREIGN_SECTION_LABEL = 'Tenant B Secret Section';
const CT_FOREIGN_TEMPLATE_ID = 'ct-e2e-template-b';

/**
 * Tenant A's own `generic` template — the positive half of the measurement.
 *
 * Three rows now share the key `generic`: the seeded platform one, B's, and A's.
 * The unscoped `findFirst` had no `ORDER BY` and no tenant arm, so it returned
 * whichever row the heap gave it — in practice the long-seeded platform row, so
 * A's own template never won. `findAccessibleTemplateByKey` asks for A's row
 * first and only falls back to the platform one, which makes the outcome
 * deterministic instead of incidental.
 */
export const CT_OWN_SECTION_LABEL = 'Tenant A Own Section';
const CT_OWN_TEMPLATE_ID = 'ct-e2e-template-a';

export async function setupConceptTemplateTenants() {
  for (const id of [CT_TENANT_A, CT_TENANT_B]) {
    await prisma.tenant.upsert({
      where: { id },
      create: { id, name: `concept template e2e ${id}`, slug: id, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.subscription.upsert({
      where: { tenantId: id },
      create: { tenantId: id, planId: 'basic', status: 'ACTIVE' },
      update: { planId: 'basic', status: 'ACTIVE', planVersionId: null },
    });
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: id, moduleId: 'M2' } },
      create: {
        tenantId: id,
        moduleId: 'M2',
        status: 'ON',
        changedBy: 'concept-template e2e fixture',
      },
      update: { status: 'ON' },
    });
  }

  await prisma.workspace.upsert({
    where: { id: CT_WORKSPACE_ID },
    create: {
      id: CT_WORKSPACE_ID,
      tenantId: CT_TENANT_A,
      name: 'concept template e2e',
      slug: CT_WORKSPACE,
    },
    update: { slug: CT_WORKSPACE },
  });

  await prisma.opportunity.upsert({
    where: { id: CT_OPPORTUNITY_ID },
    create: {
      id: CT_OPPORTUNITY_ID,
      tenantId: CT_TENANT_A,
      workspaceId: CT_WORKSPACE_ID,
      title: 'Concept template isolation probe',
      stage: 'G2',
      status: 'ACTIVE',
    },
    update: { workspaceId: CT_WORKSPACE_ID },
  });

  // Tenant B's `generic` template. Same `key` as the seeded platform row on
  // purpose: that collision is what the unscoped lookup could not tell apart.
  await prisma.conceptTemplate.upsert({
    where: { id: CT_FOREIGN_TEMPLATE_ID },
    create: {
      id: CT_FOREIGN_TEMPLATE_ID,
      tenantId: CT_TENANT_B,
      key: 'generic',
      name: CT_FOREIGN_TEMPLATE_NAME,
      version: '1.0',
      schema: [
        { key: 'secret', labelKey: CT_FOREIGN_SECTION_LABEL, maxWords: 100, promptKey: 'secret' },
      ],
    },
    update: { tenantId: CT_TENANT_B, key: 'generic', name: CT_FOREIGN_TEMPLATE_NAME },
  });

  await prisma.conceptTemplate.upsert({
    where: { id: CT_OWN_TEMPLATE_ID },
    create: {
      id: CT_OWN_TEMPLATE_ID,
      tenantId: CT_TENANT_A,
      key: 'generic',
      name: 'Tenant A Own Generic Template',
      version: '1.0',
      schema: [
        { key: 'own', labelKey: CT_OWN_SECTION_LABEL, maxWords: 100, promptKey: 'own' },
      ],
    },
    update: { tenantId: CT_TENANT_A, key: 'generic' },
  });

  // Sign-in is passwordless and provisions a tenant for an unknown address
  // (src/lib/auth.ts `authorize`), so the fixture user has to exist first or the
  // spec measures a throwaway tenant with no plan.
  await prisma.user.upsert({
    where: { id: CT_USER_ID },
    create: { id: CT_USER_ID, email: CT_EMAIL, name: 'Concept Template E2E', locale: 'tr' },
    update: { email: CT_EMAIL },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: CT_TENANT_A, userId: CT_USER_ID } },
    create: {
      tenantId: CT_TENANT_A,
      userId: CT_USER_ID,
      role: 'TENANT_OWNER',
      workspaceIds: [CT_WORKSPACE_ID],
    },
    update: { role: 'TENANT_OWNER', workspaceIds: [CT_WORKSPACE_ID] },
  });
}

export async function teardownConceptTemplateTenants() {
  const tenantIds = [CT_TENANT_A, CT_TENANT_B];
  await prisma.conceptNote.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.conceptTemplate.deleteMany({
    where: { id: { in: [CT_FOREIGN_TEMPLATE_ID, CT_OWN_TEMPLATE_ID] } },
  });
  await prisma.opportunity.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.workspace.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: CT_USER_ID } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
}

/** Real sign-in through the login form, landing on `target`. */
export async function signInAsConceptTemplateUser(page: Page, target: string) {
  // The cookie banner is a full-screen `inset-0` alertdialog and swallows clicks;
  // a recorded consent is the state a returning user is in.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(CT_EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
}

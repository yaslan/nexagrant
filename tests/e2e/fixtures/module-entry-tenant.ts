import type { ModuleStatus } from '@prisma/client';

import { prisma } from '../../../src/lib/db';

/**
 * The tenant `tests/e2e/module-entry-points.spec.ts` runs in (TASK-MVBCE3QTT3X67).
 *
 * Its own tenant, not `demo-tenant`: the spec flips the plan and module switches to
 * prove that a closed module's entry points disappear, and a plan that is the subject
 * of a test belongs to the test (scripts/seed-plan-e2e.ts explains the borrowed-row
 * failure this avoids).
 *
 * Seeded at `ultra`, which the catalogue grants every module, with every module ON
 * except M7 — so the only thing keeping TTO out of the sidebar is its OFF switch.
 * The workspace slug is deliberately not a sidebar key: `SidebarNav` marks an item
 * active by `pathname.includes('/' + key)`.
 */
export const ME_TENANT = 'fo6-entry-e2e-tenant';
export const ME_WORKSPACE_ID = 'fo6-entry-e2e-workspace';
export const ME_WORKSPACE = 'fo6-entry-ws';
export const ME_USER_ID = 'fo6-entry-e2e-user';
export const ME_EMAIL = 'fo6-entry-e2e@fabrika.test';
export const ME_OPPORTUNITY = 'fo6-entry-e2e-opp';
export const ME_OPPORTUNITY_TITLE = 'FO-6 entry points opportunity';

export const ME_MODULE_STATES: Record<string, ModuleStatus> = {
  M1: 'ON',
  M2: 'ON',
  M3: 'ON',
  M4: 'ON',
  M5: 'ON',
  M6: 'ON',
  M7: 'OFF',
  M8: 'ON',
  M9: 'ON',
  M10: 'ON',
  M11: 'ON',
};

export async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: ME_TENANT },
    data: { planId, status: 'ACTIVE', planVersionId: null },
  });
}

export async function setModule(moduleId: string, status: ModuleStatus) {
  await prisma.moduleState.update({
    where: { tenantId_moduleId: { tenantId: ME_TENANT, moduleId } },
    data: { status },
  });
}

export async function setupModuleEntryTenant() {
  await prisma.tenant.upsert({
    where: { id: ME_TENANT },
    create: { id: ME_TENANT, name: 'module entry e2e (internal)', slug: ME_TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });

  // `planVersionId` unset: getEntitlements then reads PLAN_GRANTS, the list the
  // expectations are written against. Stated on update too, so a run that died
  // mid-flip starts from `ultra` again.
  await prisma.subscription.upsert({
    where: { tenantId: ME_TENANT },
    create: { tenantId: ME_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });

  for (const [moduleId, status] of Object.entries(ME_MODULE_STATES)) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: ME_TENANT, moduleId } },
      create: { tenantId: ME_TENANT, moduleId, status, changedBy: 'module-entry e2e fixture' },
      update: { status },
    });
  }

  await prisma.workspace.upsert({
    where: { id: ME_WORKSPACE_ID },
    create: { id: ME_WORKSPACE_ID, tenantId: ME_TENANT, name: 'module entry e2e', slug: ME_WORKSPACE },
    update: { slug: ME_WORKSPACE },
  });

  // Exists before sign-in: an unknown address is provisioned a tenant of its own.
  await prisma.user.upsert({
    where: { id: ME_USER_ID },
    create: { id: ME_USER_ID, email: ME_EMAIL, name: 'Module Entry E2E', locale: 'tr' },
    update: { email: ME_EMAIL },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: ME_TENANT, userId: ME_USER_ID } },
    create: { tenantId: ME_TENANT, userId: ME_USER_ID, role: 'TENANT_OWNER', workspaceIds: [ME_WORKSPACE_ID] },
    update: { role: 'TENANT_OWNER', workspaceIds: [ME_WORKSPACE_ID] },
  });

  await prisma.opportunity.upsert({
    where: { id: ME_OPPORTUNITY },
    create: {
      id: ME_OPPORTUNITY,
      tenantId: ME_TENANT,
      workspaceId: ME_WORKSPACE_ID,
      title: ME_OPPORTUNITY_TITLE,
      ownerId: ME_USER_ID,
    },
    update: { deletedAt: null, title: ME_OPPORTUNITY_TITLE },
  });
}

/** Literal ids only: tests/teardown-where-guard.test.ts. */
export async function teardownModuleEntryTenant() {
  await prisma.opportunity.deleteMany({ where: { tenantId: 'fo6-entry-e2e-tenant' } });
  await prisma.membership.deleteMany({ where: { tenantId: 'fo6-entry-e2e-tenant' } });
  await prisma.moduleState.deleteMany({ where: { tenantId: 'fo6-entry-e2e-tenant' } });
  await prisma.subscription.deleteMany({ where: { tenantId: 'fo6-entry-e2e-tenant' } });
  await prisma.workspace.deleteMany({ where: { tenantId: 'fo6-entry-e2e-tenant' } });
  await prisma.user.deleteMany({ where: { id: 'fo6-entry-e2e-user' } });
  await prisma.tenant.deleteMany({ where: { id: 'fo6-entry-e2e-tenant' } });
  await prisma.$disconnect();
}

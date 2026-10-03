import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { signInAs } from './session';

/**
 * The tenant the M9 end-to-end specs run in.
 *
 * They used to borrow `demo-tenant` and sign in as `owner@demo.fabrika.test`.
 * Both facts have since moved underneath them: the owner belongs to a different
 * tenant now, and `demo-tenant`'s subscription is rewritten by the billing specs
 * while they run (observed flipping ultra→pro mid-session). M9 is gated on the
 * plan *and* on the tenant's own `ModuleState` switch, so a borrowed tenant put
 * the module-lock screen on the page and every M9 assertion failed for a reason
 * that had nothing to do with M9.
 *
 * Everything here is created before the specs run and deleted after, so the
 * suite leaves the database as it found it.
 */
export const M9_TENANT = 'm9-e2e-tenant';
export const M9_WORKSPACE_ID = 'm9-e2e-workspace';
export const M9_WORKSPACE = 'm9-e2e';
export const M9_OPPORTUNITY = 'm9-e2e-opportunity';
export const M9_USER_ID = 'm9-e2e-user';
// Use a timestamp suffix to prevent collisions from failed teardowns: if test N's cleanup
// fails and test N+1 runs, they won't share the same email unique constraint.
export const M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`;
export const M9_BRIEFS_URL = `/tr/${M9_WORKSPACE}/opportunities/${M9_OPPORTUNITY}/briefs`;

export async function setupM9Tenant() {
  await prisma.tenant.upsert({
    where: { id: M9_TENANT },
    create: {
      id: M9_TENANT,
      name: 'M9 E2E (internal)',
      slug: M9_TENANT,
      country: 'TR',
      orgType: 'SME',
    },
    update: {},
  });
  // `ultra` is the plan that grants M9. The gate reads the billing catalogue,
  // not this row's name, so the fixture cannot over-entitle itself.
  await prisma.subscription.upsert({
    where: { tenantId: M9_TENANT },
    create: { tenantId: M9_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE' },
  });
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: M9_TENANT, moduleId: 'M9' } },
    create: {
      tenantId: M9_TENANT,
      moduleId: 'M9',
      status: 'ON',
      changedBy: 'TASK-MTQUX5IZ9I5VP e2e fixture',
    },
    update: { status: 'ON' },
  });
  await prisma.workspace.upsert({
    where: { id: M9_WORKSPACE_ID },
    create: { id: M9_WORKSPACE_ID, tenantId: M9_TENANT, name: 'M9 E2E', slug: M9_WORKSPACE },
    update: {},
  });
  // Clean up any stray user with this email from a failed teardown.
  await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } });
  await prisma.user.upsert({
    where: { id: M9_USER_ID },
    create: { id: M9_USER_ID, email: M9_EMAIL, name: 'M9 E2E', locale: 'tr' },
    update: { email: M9_EMAIL },
  });
  await prisma.membership.upsert({
    where: { id: `${M9_USER_ID}-membership` },
    create: {
      id: `${M9_USER_ID}-membership`,
      tenantId: M9_TENANT,
      userId: M9_USER_ID,
      role: 'PIPELINE_MANAGER',
      workspaceIds: [M9_WORKSPACE_ID],
    },
    update: { tenantId: M9_TENANT, role: 'PIPELINE_MANAGER' },
  });
  await prisma.opportunity.upsert({
    where: { id: M9_OPPORTUNITY },
    create: {
      id: M9_OPPORTUNITY,
      tenantId: M9_TENANT,
      workspaceId: M9_WORKSPACE_ID,
      title: 'M9 E2E — district renovation pilot',
      stage: 'G1',
    },
    update: {},
  });
  // Credits, so the generator takes the funded path a customer sees rather than
  // the "insufficient credits" branch.
  await prisma.creditLedger.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.creditLedger.create({
    data: { tenantId: M9_TENANT, delta: 50, reason: 'TASK-MTQUX5IZ9I5VP e2e fixture' },
  });
  await prisma.meetingBrief.deleteMany({ where: { tenantId: M9_TENANT } });
}

export async function teardownM9Tenant() {
  await prisma.meetingBrief.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.creditLedger.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.opportunity.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.membership.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.subscription.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.workspace.deleteMany({ where: { tenantId: M9_TENANT } });
  await prisma.user.deleteMany({ where: { id: M9_USER_ID } });
  await prisma.tenant.deleteMany({ where: { id: M9_TENANT } });
  await prisma.$disconnect();
}

/** Sign in via JWT cookie (production mode), landing on `target`. */
export async function signInAsM9User(page: Page, target: string) {
  await signInAs(page, {
    id: M9_USER_ID,
    email: M9_EMAIL,
    tenantId: M9_TENANT,
    role: 'PIPELINE_MANAGER',
  });
  await page.goto(target);
}

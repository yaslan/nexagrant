import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';

/**
 * The tenant the `notFound()` status spec runs in.
 *
 * Every module is ON and the plan is the one that sells them, because the
 * module gate answers *before* a page's own existence check: on a tenant whose
 * M9 is off, `/opportunities/<unknown>/briefs` returns the lock screen with a
 * perfectly correct 200 and never reaches `notFound()`. Measuring the status on
 * such a tenant reads as "still broken" when nothing is broken — the reason the
 * first pass at TASK-MTRNO3LBZB2Q7 saw six routes it could not explain.
 *
 * Created before the spec and deleted after, so the suite leaves the database
 * as it found it.
 */
export const NF_TENANT = 'nf-e2e-tenant';
export const NF_WORKSPACE_ID = 'nf-e2e-workspace';
export const NF_WORKSPACE = 'nf-e2e';
export const NF_USER_ID = 'nf-e2e-user';
export const NF_EMAIL = 'nf-e2e@fabrika.test';

const MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'];

export async function setupNotFoundTenant() {
  await prisma.tenant.upsert({
    where: { id: NF_TENANT },
    create: {
      id: NF_TENANT,
      name: 'notFound status e2e (internal)',
      slug: NF_TENANT,
      country: 'TR',
      orgType: 'SME',
    },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { tenantId: NF_TENANT },
    create: { tenantId: NF_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE' },
  });
  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: NF_TENANT, moduleId } },
      create: {
        tenantId: NF_TENANT,
        moduleId,
        status: 'ON',
        changedBy: 'TASK-MTRNO3LBZB2Q7 e2e fixture',
      },
      update: { status: 'ON' },
    });
  }
  await prisma.workspace.upsert({
    where: { id: NF_WORKSPACE_ID },
    create: {
      id: NF_WORKSPACE_ID,
      tenantId: NF_TENANT,
      name: 'notFound status e2e',
      slug: NF_WORKSPACE,
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: NF_USER_ID },
    create: { id: NF_USER_ID, email: NF_EMAIL, name: 'notFound E2E', locale: 'tr' },
    update: { email: NF_EMAIL },
  });
  await prisma.membership.upsert({
    where: { id: `${NF_USER_ID}-membership` },
    create: {
      id: `${NF_USER_ID}-membership`,
      tenantId: NF_TENANT,
      userId: NF_USER_ID,
      role: 'TENANT_OWNER',
      workspaceIds: [NF_WORKSPACE_ID],
    },
    update: { tenantId: NF_TENANT, role: 'TENANT_OWNER' },
  });
}

export async function teardownNotFoundTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: NF_TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: NF_TENANT } });
  await prisma.subscription.deleteMany({ where: { tenantId: NF_TENANT } });
  await prisma.workspace.deleteMany({ where: { tenantId: NF_TENANT } });
  await prisma.user.deleteMany({ where: { id: NF_USER_ID } });
  await prisma.tenant.deleteMany({ where: { id: NF_TENANT } });
  await prisma.$disconnect();
}

/** Real sign-in through the login form, landing on `target`. */
export async function signInAsNotFoundUser(page: Page, target: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(NF_EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
}

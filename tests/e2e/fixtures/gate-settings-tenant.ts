import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { signInAs } from './session';

/**
 * The tenant `tests/e2e/gate-settings-readonly.spec.ts` runs in.
 *
 * The settings page used to be a form whose "Save" only waited 800 ms and
 * alerted "saved" (AKTAR-MURBCJ0A-1, denetim bulgusu cae-fb K-1). The spec signs
 * in as a real member so it measures the page the session renders, not the
 * login screen.
 *
 * `settings.scoringWeights.alignment` is set on purpose: the G0 scorer reads
 * tenant weights through `resolveWeights(Tenant.settings)`, so the page has to
 * show that value rather than the platform default. The other weights are left
 * unset and must fall back to the default.
 *
 * Created before the spec and deleted after, so the suite leaves the database
 * as it found it.
 */
export const SG_TENANT = 'sg-e2e-tenant';
export const SG_WORKSPACE_ID = 'sg-e2e-workspace';
export const SG_WORKSPACE = 'sg-e2e';
export const SG_USER_ID = 'sg-e2e-user';
export const SG_EMAIL = 'sg-e2e@gates.test';
/** Differs from `DEFAULT_SCORING_WEIGHTS.alignment` (30), so a page that ignores the tenant shows. */
export const SG_ALIGNMENT_WEIGHT = 42;

const MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'];

export async function setupGateSettingsTenant() {
  await prisma.tenant.upsert({
    where: { id: SG_TENANT },
    create: {
      id: SG_TENANT,
      name: 'gate settings e2e (internal)',
      slug: SG_TENANT,
      country: 'TR',
      orgType: 'SME',
      settings: { scoringWeights: { alignment: SG_ALIGNMENT_WEIGHT } },
    },
    update: { settings: { scoringWeights: { alignment: SG_ALIGNMENT_WEIGHT } } },
  });
  await prisma.subscription.upsert({
    where: { tenantId: SG_TENANT },
    create: { tenantId: SG_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });
  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: SG_TENANT, moduleId } },
      create: { tenantId: SG_TENANT, moduleId, status: 'ON', changedBy: 'gate-settings e2e fixture' },
      update: { status: 'ON' },
    });
  }
  await prisma.workspace.upsert({
    where: { id: SG_WORKSPACE_ID },
    create: { id: SG_WORKSPACE_ID, tenantId: SG_TENANT, name: 'gate settings e2e', slug: SG_WORKSPACE },
    update: { slug: SG_WORKSPACE },
  });
  await prisma.user.upsert({
    where: { id: SG_USER_ID },
    create: { id: SG_USER_ID, email: SG_EMAIL, name: 'Gate Settings E2E', locale: 'tr' },
    update: { email: SG_EMAIL },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: SG_TENANT, userId: SG_USER_ID } },
    create: { tenantId: SG_TENANT, userId: SG_USER_ID, role: 'TENANT_OWNER', workspaceIds: [SG_WORKSPACE_ID] },
    update: { role: 'TENANT_OWNER', workspaceIds: [SG_WORKSPACE_ID] },
  });
}

export async function teardownGateSettingsTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: SG_TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: SG_TENANT } });
  await prisma.subscription.deleteMany({ where: { tenantId: SG_TENANT } });
  await prisma.workspace.deleteMany({ where: { tenantId: SG_TENANT } });
  await prisma.user.deleteMany({ where: { id: SG_USER_ID } });
  await prisma.tenant.deleteMany({ where: { id: SG_TENANT } });
  await prisma.$disconnect();
}

/** Sign in via JWT cookie (production mode), landing on `target`. */
export async function signInAsGateSettingsUser(page: Page, target: string) {
  await signInAs(page, {
    id: SG_USER_ID,
    email: SG_EMAIL,
    tenantId: SG_TENANT,
    role: 'TENANT_OWNER',
  });
  await page.goto(target);
}

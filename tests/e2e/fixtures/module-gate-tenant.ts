import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { signInAs } from './session';

/**
 * The tenant `tests/e2e/module-gate.spec.ts` runs in.
 *
 * The spec used to point at `/en/default/…` with no session at all. `default` is
 * not the demo tenant's workspace (`main` is) — it is the slug auto-provisioning
 * hands to throwaway tenants — and since c915bc43 the `(app)` layout redirects an
 * anonymous visitor to the login route before any page renders, so every request
 * the spec made ended on the sign-in screen. Owning a tenant is what lets the
 * spec state the module status it is measuring instead of reading whatever the
 * shared demo rows happen to say this hour.
 *
 * The plan is `basic`, which the catalogue grants M2/M3/M5. Both modules the spec
 * touches are therefore *entitled*, and the only thing separating them is the
 * `ModuleState` switch:
 *
 *   M5  ON   Proposal Production Workflows — /pipeline and its /firsatlar alias open.
 *   M3  OFF  Evidence Pack — refused with `MODULE_OFF`, and the sentence has to say
 *            "turned off", not "upgrade your plan".
 *
 * That split is the point of this file. `module-plan-gate.spec.ts` owns the other
 * half of the gate (entitled vs. not, on its own flipping tenant); keeping this
 * one entirely inside a single plan means a failure here can only be the status
 * switch.
 *
 * `planVersionId` is deliberately left unset: `getEntitlements` falls back to
 * `PLAN_GRANTS` when a subscription points at no version, which is the fixed list
 * this spec's expectations are written against.
 *
 * Created before the spec and deleted after, so the suite leaves the database as
 * it found it.
 */
export const MG_TENANT = 'mg-e2e-tenant';
export const MG_WORKSPACE_ID = 'mg-e2e-workspace';
export const MG_WORKSPACE = 'mg-e2e';
export const MG_USER_ID = 'mg-e2e-user';
export const MG_EMAIL = 'mg-e2e@fabrika.test';

/** `on` opens the module, `off` is the refusal this spec wants to read. */
const MODULE_STATES = { M5: 'ON', M3: 'OFF' } as const;

export async function setupModuleGateTenant() {
  await prisma.tenant.upsert({
    where: { id: MG_TENANT },
    create: {
      id: MG_TENANT,
      name: 'module gate e2e (internal)',
      slug: MG_TENANT,
      country: 'TR',
      orgType: 'SME',
    },
    update: {},
  });

  // Written out rather than left empty: a re-run must start from `basic` even if a
  // previous run died between its own writes.
  await prisma.subscription.upsert({
    where: { tenantId: MG_TENANT },
    create: { tenantId: MG_TENANT, planId: 'basic', status: 'ACTIVE' },
    update: { planId: 'basic', status: 'ACTIVE', planVersionId: null },
  });

  for (const [moduleId, status] of Object.entries(MODULE_STATES)) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: MG_TENANT, moduleId } },
      create: { tenantId: MG_TENANT, moduleId, status, changedBy: 'module-gate e2e fixture' },
      update: { status },
    });
  }

  await prisma.workspace.upsert({
    where: { id: MG_WORKSPACE_ID },
    create: {
      id: MG_WORKSPACE_ID,
      tenantId: MG_TENANT,
      name: 'module gate e2e',
      slug: MG_WORKSPACE,
    },
    update: { slug: MG_WORKSPACE },
  });

  // Sign-in is passwordless and provisions a tenant for any address it does not
  // recognise (src/lib/auth.ts `authorize`), so a fixture user that does not exist
  // before the spec signs in would quietly get a tenant of its own with no plan —
  // and the spec would measure that instead.
  await prisma.user.upsert({
    where: { id: MG_USER_ID },
    create: { id: MG_USER_ID, email: MG_EMAIL, name: 'Module Gate E2E', locale: 'tr' },
    update: { email: MG_EMAIL },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: MG_TENANT, userId: MG_USER_ID } },
    create: {
      tenantId: MG_TENANT,
      userId: MG_USER_ID,
      role: 'TENANT_OWNER',
      workspaceIds: [MG_WORKSPACE_ID],
    },
    update: { role: 'TENANT_OWNER', workspaceIds: [MG_WORKSPACE_ID] },
  });
}

export async function teardownModuleGateTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: MG_TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: MG_TENANT } });
  await prisma.subscription.deleteMany({ where: { tenantId: MG_TENANT } });
  await prisma.workspace.deleteMany({ where: { tenantId: MG_TENANT } });
  await prisma.user.deleteMany({ where: { id: MG_USER_ID } });
  await prisma.tenant.deleteMany({ where: { id: MG_TENANT } });
  await prisma.$disconnect();
}

/** Sign in via JWT cookie (production mode), landing on `target`. */
export async function signInAsModuleGateUser(page: Page, target: string) {
  await signInAs(page, {
    id: MG_USER_ID,
    email: MG_EMAIL,
    tenantId: MG_TENANT,
    role: 'TENANT_OWNER',
  });
  await page.goto(target);
}

import type { ModuleStatus, Role } from '@prisma/client';

import { prisma } from '../../../src/lib/db';

/**
 * The tenant `tests/e2e/role-nav.spec.ts` runs in (NG-4): one seat per code role,
 * at `ultra` so only `ModuleState` and the role decide the menu. Its own tenant,
 * because the spec flips module switches.
 */
export const RN_TENANT = 'ng4-role-nav-e2e-tenant';
export const RN_WORKSPACE_ID = 'ng4-role-nav-e2e-workspace';
export const RN_WORKSPACE = 'ng4-rol-ws';

export const RN_SEATS: Record<Role, { id: string; email: string }> = {
  TENANT_OWNER: { id: 'ng4-role-nav-owner', email: 'ng4-owner@fabrika.test' },
  TENANT_ADMIN: { id: 'ng4-role-nav-admin', email: 'ng4-admin@fabrika.test' },
  PIPELINE_MANAGER: { id: 'ng4-role-nav-manager', email: 'ng4-manager@fabrika.test' },
  WRITER: { id: 'ng4-role-nav-writer', email: 'ng4-writer@fabrika.test' },
  MEMBER: { id: 'ng4-role-nav-member', email: 'ng4-member@fabrika.test' },
  GUEST_PARTNER: { id: 'ng4-role-nav-guest', email: 'ng4-guest@fabrika.test' },
};

const MODULES: Record<string, ModuleStatus> = {
  M1: 'ON',
  M2: 'ON',
  M3: 'ON',
  M4: 'ON',
  M5: 'ON',
  M7: 'OFF',
};

export async function setRoleNavModule(moduleId: string, status: ModuleStatus) {
  await prisma.moduleState.update({
    where: { tenantId_moduleId: { tenantId: RN_TENANT, moduleId } },
    data: { status },
  });
}

export async function setupRoleNavTenant() {
  await prisma.tenant.upsert({
    where: { id: RN_TENANT },
    create: { id: RN_TENANT, name: 'role nav e2e (internal)', slug: RN_TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { tenantId: RN_TENANT },
    create: { tenantId: RN_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });
  for (const [moduleId, status] of Object.entries(MODULES)) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: RN_TENANT, moduleId } },
      create: { tenantId: RN_TENANT, moduleId, status, changedBy: 'role nav e2e fixture' },
      update: { status },
    });
  }
  await prisma.workspace.upsert({
    where: { id: RN_WORKSPACE_ID },
    create: { id: RN_WORKSPACE_ID, tenantId: RN_TENANT, name: 'role nav e2e', slug: RN_WORKSPACE },
    update: { slug: RN_WORKSPACE },
  });
  for (const [role, seat] of Object.entries(RN_SEATS) as [Role, { id: string; email: string }][]) {
    await prisma.user.upsert({
      where: { id: seat.id },
      create: { id: seat.id, email: seat.email, name: `NG-4 ${role}`, locale: 'tr' },
      update: { email: seat.email },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: RN_TENANT, userId: seat.id } },
      create: { tenantId: RN_TENANT, userId: seat.id, role, workspaceIds: [RN_WORKSPACE_ID] },
      update: { role, workspaceIds: [RN_WORKSPACE_ID] },
    });
  }
}

/** Literal ids only: tests/teardown-where-guard.test.ts. */
export async function teardownRoleNavTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: 'ng4-role-nav-e2e-tenant' } });
  await prisma.moduleState.deleteMany({ where: { tenantId: 'ng4-role-nav-e2e-tenant' } });
  await prisma.subscription.deleteMany({ where: { tenantId: 'ng4-role-nav-e2e-tenant' } });
  await prisma.workspace.deleteMany({ where: { tenantId: 'ng4-role-nav-e2e-tenant' } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          'ng4-role-nav-owner',
          'ng4-role-nav-admin',
          'ng4-role-nav-manager',
          'ng4-role-nav-writer',
          'ng4-role-nav-member',
          'ng4-role-nav-guest',
        ],
      },
    },
  });
  await prisma.tenant.deleteMany({ where: { id: 'ng4-role-nav-e2e-tenant' } });
  await prisma.$disconnect();
}

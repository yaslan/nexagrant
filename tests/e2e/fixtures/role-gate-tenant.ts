import type { Role } from '@prisma/client';

import { prisma } from '../../../src/lib/db';

/**
 * The tenant `tests/e2e/role-gate.spec.ts` runs in (NG-64): one seat per code
 * role, every module the gated pages sit behind ON at `ultra`, and one
 * opportunity plus one relationship whose marked text must never reach a role
 * without the page's permission.
 */
export const RG_TENANT = 'ng64-role-gate-e2e-tenant';
export const RG_WORKSPACE_ID = 'ng64-role-gate-e2e-workspace';
export const RG_WORKSPACE = 'ng64-kapi-ws';
export const RG_OPP_ID = 'ng64-role-gate-e2e-opp';
export const RG_REL_ID = 'ng64-role-gate-e2e-rel';
/** Text only the seeded rows carry: seen on a page or in a body, the door is open. */
export const RG_OPP_TITLE = 'NG64 kiracıya özel fırsat — Kapı testi';
export const RG_REL_NAME = 'NG64 kiracıya özel ilişki';

/** A domain only this fixture uses: `User.email` is unique (NG-4 review N-1). */
export const RG_SEATS: Record<Role, { id: string; email: string }> = {
  TENANT_OWNER: { id: 'ng64-role-gate-owner', email: 'owner@ng64-role-gate.e2e.fabrika.test' },
  TENANT_ADMIN: { id: 'ng64-role-gate-admin', email: 'admin@ng64-role-gate.e2e.fabrika.test' },
  PIPELINE_MANAGER: { id: 'ng64-role-gate-manager', email: 'manager@ng64-role-gate.e2e.fabrika.test' },
  WRITER: { id: 'ng64-role-gate-writer', email: 'writer@ng64-role-gate.e2e.fabrika.test' },
  MEMBER: { id: 'ng64-role-gate-member', email: 'member@ng64-role-gate.e2e.fabrika.test' },
  GUEST_PARTNER: { id: 'ng64-role-gate-guest', email: 'guest@ng64-role-gate.e2e.fabrika.test' },
};

const MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'];

export async function setupRoleGateTenant() {
  await prisma.tenant.upsert({
    where: { id: RG_TENANT },
    create: { id: RG_TENANT, name: 'role gate e2e (internal)', slug: RG_TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { tenantId: RG_TENANT },
    create: { tenantId: RG_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });
  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: RG_TENANT, moduleId } },
      create: { tenantId: RG_TENANT, moduleId, status: 'ON', changedBy: 'role gate e2e fixture' },
      update: { status: 'ON' },
    });
  }
  await prisma.workspace.upsert({
    where: { id: RG_WORKSPACE_ID },
    create: { id: RG_WORKSPACE_ID, tenantId: RG_TENANT, name: 'role gate e2e', slug: RG_WORKSPACE },
    update: { slug: RG_WORKSPACE },
  });
  for (const [role, seat] of Object.entries(RG_SEATS) as [Role, { id: string; email: string }][]) {
    await prisma.user.upsert({
      where: { id: seat.id },
      create: { id: seat.id, email: seat.email, name: `NG-64 ${role}`, locale: 'tr' },
      update: { email: seat.email },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: RG_TENANT, userId: seat.id } },
      create: { tenantId: RG_TENANT, userId: seat.id, role, workspaceIds: [RG_WORKSPACE_ID] },
      update: { role, workspaceIds: [RG_WORKSPACE_ID] },
    });
  }
  await prisma.opportunity.upsert({
    where: { id: RG_OPP_ID },
    create: {
      id: RG_OPP_ID,
      tenantId: RG_TENANT,
      workspaceId: RG_WORKSPACE_ID,
      title: RG_OPP_TITLE,
      stage: 'G0',
      ownerId: RG_SEATS.TENANT_OWNER.id,
    },
    update: { title: RG_OPP_TITLE, deletedAt: null },
  });
  await prisma.relationship.upsert({
    where: { id: RG_REL_ID },
    create: { id: RG_REL_ID, tenantId: RG_TENANT, kind: 'partner', counterpartName: RG_REL_NAME },
    update: { counterpartName: RG_REL_NAME },
  });
}

/** Literal ids only: tests/teardown-where-guard.test.ts. */
export async function teardownRoleGateTenant() {
  await prisma.relationship.deleteMany({ where: { id: 'ng64-role-gate-e2e-rel' } });
  await prisma.opportunity.deleteMany({ where: { id: 'ng64-role-gate-e2e-opp' } });
  await prisma.membership.deleteMany({ where: { tenantId: 'ng64-role-gate-e2e-tenant' } });
  await prisma.moduleState.deleteMany({ where: { tenantId: 'ng64-role-gate-e2e-tenant' } });
  await prisma.subscription.deleteMany({ where: { tenantId: 'ng64-role-gate-e2e-tenant' } });
  await prisma.workspace.deleteMany({ where: { tenantId: 'ng64-role-gate-e2e-tenant' } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          'ng64-role-gate-owner',
          'ng64-role-gate-admin',
          'ng64-role-gate-manager',
          'ng64-role-gate-writer',
          'ng64-role-gate-member',
          'ng64-role-gate-guest',
        ],
      },
    },
  });
  await prisma.tenant.deleteMany({ where: { id: 'ng64-role-gate-e2e-tenant' } });
  await prisma.$disconnect();
}

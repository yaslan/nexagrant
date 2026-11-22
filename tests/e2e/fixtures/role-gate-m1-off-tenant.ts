import type { Role } from '@prisma/client';

import { prisma } from '../../../src/lib/db';

/**
 * NG-276: a tenant of its own whose M1 is OFF, for the order of the two doors on the
 * Partner Search pages (role door first, module lock second). The shared role-gate
 * tenant keeps every module ON and is not touched: the plan is `ultra`, so the only
 * thing that closes M1 here is the `ModuleState` switch, and the lock says MODULE_OFF.
 */
export const M1OFF_TENANT = 'ng276-m1-off-e2e-tenant';
export const M1OFF_WORKSPACE_ID = 'ng276-m1-off-e2e-workspace';
export const M1OFF_WORKSPACE = 'ng276-m1off-ws';

/** Own seats and a domain only this fixture uses (`User.email` is unique). */
export const M1OFF_SEATS: Partial<Record<Role, { id: string; email: string }>> & Record<'GUEST_PARTNER' | 'MEMBER' | 'TENANT_OWNER', { id: string; email: string }> = {
  GUEST_PARTNER: { id: 'ng276-m1-off-guest', email: 'guest@ng276-m1-off.e2e.fabrika.test' },
  MEMBER: { id: 'ng276-m1-off-member', email: 'member@ng276-m1-off.e2e.fabrika.test' },
  TENANT_OWNER: { id: 'ng276-m1-off-owner', email: 'owner@ng276-m1-off.e2e.fabrika.test' },
};

const MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'];

export async function setupM1OffTenant() {
  await prisma.tenant.upsert({
    where: { id: M1OFF_TENANT },
    create: { id: M1OFF_TENANT, name: 'ng276 m1 off e2e (internal)', slug: M1OFF_TENANT, country: 'TR', orgType: 'SME' },
    update: { deletedAt: null },
  });
  await prisma.subscription.upsert({
    where: { tenantId: M1OFF_TENANT },
    create: { tenantId: M1OFF_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });
  for (const moduleId of MODULES) {
    const status = moduleId === 'M1' ? 'OFF' : 'ON';
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: M1OFF_TENANT, moduleId } },
      create: { tenantId: M1OFF_TENANT, moduleId, status, changedBy: 'ng276 m1-off e2e fixture' },
      update: { status },
    });
  }
  await prisma.workspace.upsert({
    where: { id: M1OFF_WORKSPACE_ID },
    create: { id: M1OFF_WORKSPACE_ID, tenantId: M1OFF_TENANT, name: 'ng276 m1 off e2e', slug: M1OFF_WORKSPACE },
    update: { slug: M1OFF_WORKSPACE },
  });
  for (const [role, seat] of Object.entries(M1OFF_SEATS) as [Role, { id: string; email: string }][]) {
    await prisma.user.upsert({
      where: { id: seat.id },
      create: { id: seat.id, email: seat.email, name: `NG-276 ${role}`, locale: 'tr' },
      update: { email: seat.email },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: M1OFF_TENANT, userId: seat.id } },
      create: { tenantId: M1OFF_TENANT, userId: seat.id, role, workspaceIds: [M1OFF_WORKSPACE_ID] },
      update: { role, workspaceIds: [M1OFF_WORKSPACE_ID] },
    });
  }
}

/** Literal ids only: tests/teardown-where-guard.test.ts. */
export async function teardownM1OffTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: 'ng276-m1-off-e2e-tenant' } });
  await prisma.moduleState.deleteMany({ where: { tenantId: 'ng276-m1-off-e2e-tenant' } });
  await prisma.subscription.deleteMany({ where: { tenantId: 'ng276-m1-off-e2e-tenant' } });
  await prisma.workspace.deleteMany({ where: { tenantId: 'ng276-m1-off-e2e-tenant' } });
  await prisma.user.deleteMany({
    where: { id: { in: ['ng276-m1-off-guest', 'ng276-m1-off-member', 'ng276-m1-off-owner'] } },
  });
  await prisma.tenant.deleteMany({ where: { id: 'ng276-m1-off-e2e-tenant' } });
}

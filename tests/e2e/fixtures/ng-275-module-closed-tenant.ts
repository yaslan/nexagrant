import type { Role } from '@prisma/client';

import { prisma } from '../../../src/lib/db';

/**
 * The tenant `tests/e2e/ng-275-module-closed-role-gate.spec.ts` runs in (NG-275).
 *
 * The role gate now runs before the module gate on the pages NG-275 reordered. To
 * see that order from outside, the tenant must have the module OFF while its plan
 * still includes it: then `moduleGate` has a real lock to show, and the only thing
 * that can make a refused role see something else is the door order.
 *
 * Plan `ultra` (entitled to every module the pages sit behind), with M1, M2 and M5
 * switched OFF. Two seats: MEMBER holds every permission the five pages ask for, so
 * it is the authorised role that must still read the lock screen; GUEST_PARTNER holds
 * none of them, so it must get the 403 and never the lock.
 *
 * Created before the spec and deleted after, same as `module-gate-tenant.ts`.
 */
export const NG275_TENANT = 'ng275-module-closed-e2e-tenant';
export const NG275_WORKSPACE_ID = 'ng275-module-closed-e2e-workspace';
export const NG275_WORKSPACE = 'ng275-closed-ws';

/** Modules the five target pages sit behind (M5 pipeline/approvals/person-days, M2 concept notes, M1 partners). */
const CLOSED_MODULES = ['M1', 'M2', 'M5'] as const;

/** Seats are unique to this fixture: `User.email` is unique across the shared database. */
export const NG275_SEATS: Record<'MEMBER' | 'GUEST_PARTNER', { id: string; email: string }> = {
  MEMBER: { id: 'ng275-closed-member', email: 'member@ng275-module-closed.e2e.fabrika.test' },
  GUEST_PARTNER: { id: 'ng275-closed-guest', email: 'guest@ng275-module-closed.e2e.fabrika.test' },
};

export async function setupNg275ModuleClosedTenant() {
  await prisma.tenant.upsert({
    where: { id: NG275_TENANT },
    create: { id: NG275_TENANT, name: 'ng275 module closed (e2e)', slug: NG275_TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });
  // Written out, not left empty: a re-run must start on `ultra` even if a previous run
  // died between its own writes.
  await prisma.subscription.upsert({
    where: { tenantId: NG275_TENANT },
    create: { tenantId: NG275_TENANT, planId: 'ultra', status: 'ACTIVE' },
    update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
  });
  for (const moduleId of CLOSED_MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: NG275_TENANT, moduleId } },
      create: { tenantId: NG275_TENANT, moduleId, status: 'OFF', changedBy: 'ng-275 module-closed e2e fixture' },
      update: { status: 'OFF' },
    });
  }
  await prisma.workspace.upsert({
    where: { id: NG275_WORKSPACE_ID },
    create: { id: NG275_WORKSPACE_ID, tenantId: NG275_TENANT, name: 'ng275 module closed e2e', slug: NG275_WORKSPACE },
    update: { slug: NG275_WORKSPACE },
  });
  for (const [role, seat] of Object.entries(NG275_SEATS) as [Role, { id: string; email: string }][]) {
    await prisma.user.upsert({
      where: { id: seat.id },
      create: { id: seat.id, email: seat.email, name: `NG-275 ${role}`, locale: 'tr' },
      update: { email: seat.email },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: NG275_TENANT, userId: seat.id } },
      create: { tenantId: NG275_TENANT, userId: seat.id, role, workspaceIds: [NG275_WORKSPACE_ID] },
      update: { role, workspaceIds: [NG275_WORKSPACE_ID] },
    });
  }
}

export async function teardownNg275ModuleClosedTenant() {
  await prisma.membership.deleteMany({ where: { tenantId: NG275_TENANT } });
  await prisma.moduleState.deleteMany({ where: { tenantId: NG275_TENANT } });
  await prisma.subscription.deleteMany({ where: { tenantId: NG275_TENANT } });
  await prisma.workspace.deleteMany({ where: { tenantId: NG275_TENANT } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(NG275_SEATS).map((s) => s.id) } } });
  await prisma.tenant.deleteMany({ where: { id: NG275_TENANT } });
  await prisma.$disconnect();
}

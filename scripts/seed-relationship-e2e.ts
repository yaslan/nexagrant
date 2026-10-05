/**
 * Two-tenant fixture for the relationship tenant-isolation tests, and its rollback.
 *
 * TASK-MTRKV9JGY7OQY: the M4 relationship screens read `session?.tenantId`
 * (`string | null | undefined`) straight into a Prisma `where` clause. Prisma
 * drops an `undefined` clause, so the detail page became a lookup by cuid alone
 * and the list page (`where: tenantId ? { tenantId } : {}`) became an unfiltered
 * `findMany`. Proving the fix needs a *second* tenant with a real row in the
 * database: without tenant B, a green happy path only shows the screen works,
 * not that it refuses somebody else's id.
 *
 * Tenant A is the one the browser signs in as. Tenant B is never signed in as —
 * its relationship id is exactly the id an attacker would paste into the URL.
 * Both tenants get a `pro` subscription and `ModuleState` M4 = ON, because the
 * page sits behind `moduleGate('M4')` and a locked module would hide the very
 * query under test.
 *
 * Idempotent; `--rollback` deletes exactly the ids below.
 *
 *   pnpm tsx scripts/seed-relationship-e2e.ts
 *   pnpm tsx scripts/seed-relationship-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const REL_E2E = {
  /** Tenant A — signed in. */
  email: 'rel-e2e-a@fabrika.test',
  tenantId: 'rel-e2e-tenant-a',
  workspaceId: 'rel-e2e-workspace-a',
  workspaceSlug: 'rel-e2e-ws-a',
  userId: 'rel-e2e-user-a',
  relationshipId: 'rel-e2e-relationship-a',
  counterpartName: 'Kiracı A — Odak Nokta',
  interactionId: 'rel-e2e-interaction-a',

  /** Tenant B — never signed in as; only its id travels. */
  otherTenantId: 'rel-e2e-tenant-b',
  otherWorkspaceId: 'rel-e2e-workspace-b',
  otherWorkspaceSlug: 'rel-e2e-ws-b',
  otherUserId: 'rel-e2e-user-b',
  otherRelationshipId: 'rel-e2e-relationship-b',
  /** If this string ever renders in tenant A's browser, the isolation is broken. */
  otherCounterpartName: 'KIRACI-B-GIZLI-KAYIT',
  otherInteractionId: 'rel-e2e-interaction-b',
} as const;

const TENANTS = [
  {
    tenantId: REL_E2E.tenantId,
    slug: 'rel-e2e-a',
    workspaceId: REL_E2E.workspaceId,
    workspaceSlug: REL_E2E.workspaceSlug,
    userId: REL_E2E.userId,
    email: REL_E2E.email,
    relationshipId: REL_E2E.relationshipId,
    counterpartName: REL_E2E.counterpartName,
    interactionId: REL_E2E.interactionId,
  },
  {
    tenantId: REL_E2E.otherTenantId,
    slug: 'rel-e2e-b',
    workspaceId: REL_E2E.otherWorkspaceId,
    workspaceSlug: REL_E2E.otherWorkspaceSlug,
    userId: REL_E2E.otherUserId,
    email: 'rel-e2e-b@fabrika.test',
    relationshipId: REL_E2E.otherRelationshipId,
    counterpartName: REL_E2E.otherCounterpartName,
    interactionId: REL_E2E.otherInteractionId,
  },
] as const;

export async function seed() {
  for (const t of TENANTS) {
    await prisma.tenant.upsert({
      where: { id: t.tenantId },
      update: {},
      create: {
        id: t.tenantId,
        name: `Relationship E2E ${t.slug}`,
        slug: t.slug,
        country: 'TR',
        orgType: 'SME',
      },
    });

    // M4 is granted by `pro` and above (src/lib/billing/catalog.ts PLAN_GRANTS).
    await prisma.subscription.upsert({
      where: { tenantId: t.tenantId },
      update: { planId: 'pro', status: 'ACTIVE' },
      create: { tenantId: t.tenantId, planId: 'pro', status: 'ACTIVE' },
    });

    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: t.tenantId, moduleId: 'M4' } },
      update: { status: 'ON' },
      create: { tenantId: t.tenantId, moduleId: 'M4', status: 'ON' },
    });

    await prisma.workspace.upsert({
      where: { id: t.workspaceId },
      update: {},
      create: {
        id: t.workspaceId,
        tenantId: t.tenantId,
        name: `Relationship E2E ${t.slug}`,
        slug: t.workspaceSlug,
      },
    });

    await prisma.user.upsert({
      where: { id: t.userId },
      update: { email: t.email },
      create: { id: t.userId, email: t.email, name: `Rel E2E ${t.slug}`, locale: 'tr' },
    });

    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: t.tenantId, userId: t.userId } },
      update: { role: 'TENANT_OWNER', workspaceIds: [t.workspaceId] },
      create: {
        userId: t.userId,
        tenantId: t.tenantId,
        role: 'TENANT_OWNER',
        workspaceIds: [t.workspaceId],
      },
    });

    await prisma.relationship.upsert({
      where: { id: t.relationshipId },
      update: { counterpartName: t.counterpartName, tenantId: t.tenantId },
      create: {
        id: t.relationshipId,
        tenantId: t.tenantId,
        ownerUserId: t.userId,
        kind: 'partner',
        counterpartName: t.counterpartName,
        counterpartEmail: t.email,
        warmth: 'warm',
        notes: `Fixture row for ${t.tenantId}.`,
      },
    });

    await prisma.interaction.upsert({
      where: { id: t.interactionId },
      update: { summary: `${t.counterpartName} — görüşme notu` },
      create: {
        id: t.interactionId,
        tenantId: t.tenantId,
        relationshipId: t.relationshipId,
        kind: 'meeting',
        at: new Date('2026-09-01T09:00:00.000Z'),
        summary: `${t.counterpartName} — görüşme notu`,
        createdBy: t.userId,
      },
    });
  }

  console.log(
    `[seed-relationship-e2e] ready — A=${REL_E2E.tenantId}/${REL_E2E.relationshipId} ` +
      `B=${REL_E2E.otherTenantId}/${REL_E2E.otherRelationshipId}`,
  );
}

export async function rollback() {
  const relIds = TENANTS.map((t) => t.relationshipId);
  const tenantIds = TENANTS.map((t) => t.tenantId);
  const userIds = TENANTS.map((t) => t.userId);
  const workspaceIds = TENANTS.map((t) => t.workspaceId);

  await prisma.interaction.deleteMany({ where: { relationshipId: { in: relIds } } });
  await prisma.relationship.deleteMany({ where: { id: { in: relIds } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  console.log('[seed-relationship-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-relationship-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-relationship-e2e] failed:', e);
      process.exit(1);
    });
}

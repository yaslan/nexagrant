/**
 * TASK-MTS9C07AQ6DNO — a plan fixture that belongs to the tests, so no spec has to
 * borrow the shared demo tenant's subscription.
 *
 * Two e2e specs used to change `demo-tenant`'s `planId` in `beforeAll` and put it back
 * in `afterAll` (`m10-audit-identity`, `module-plan-gate`). Both restored correctly, and
 * both were still wrong: `demo-tenant` is the tenant the demo data, the dashboard specs
 * and a developer's own browser session all read from, and the restore only holds if
 * nothing else looks in between. Agents run their specs against separate dev servers but
 * against one Postgres, so "in between" is a real window, and a spec that reads
 * `demo-tenant`'s plan while another spec has it flipped fails for a reason that is
 * nowhere in its own file.
 *
 * So the entitlement each spec needs is seeded as its own tenant:
 *
 *   ultra  permanently `ultra` — nothing flips it. For specs that only need the module
 *          to be reachable (m10-audit-identity).
 *   flip   the tenant whose plan IS the subject. `module-plan-gate` moves it between
 *          `pro` and `ultra` on purpose; owning the tenant is what makes that safe.
 *
 * Kept apart deliberately: one tenant for both would put the flipping spec and the
 * reading spec back on the same row, which is the failure this fixture exists to end.
 *
 * Idempotent: every write is an upsert on a fixed id. `--rollback` deletes exactly these
 * ids and nothing else.
 *
 *   pnpm tsx scripts/seed-plan-e2e.ts
 *   pnpm tsx scripts/seed-plan-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

interface PlanFixture {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  email: string;
  opportunityId: string;
  /** The plan the fixture is seeded at; `flip` moves away from it and back. */
  planId: string;
  role: string;
}

export const PLAN_E2E = {
  ultra: {
    tenantId: 'plan-e2e-ultra-tenant',
    workspaceId: 'plan-e2e-ultra-workspace',
    workspaceSlug: 'plan-e2e-ultra-ws',
    userId: 'plan-e2e-ultra-user',
    email: 'plan-e2e-ultra@fabrika.test',
    opportunityId: 'plan-e2e-ultra-opp',
    planId: 'ultra',
    role: 'PIPELINE_MANAGER',
  },
  flip: {
    tenantId: 'plan-e2e-flip-tenant',
    workspaceId: 'plan-e2e-flip-workspace',
    workspaceSlug: 'plan-e2e-flip-ws',
    userId: 'plan-e2e-flip-user',
    email: 'plan-e2e-flip@fabrika.test',
    opportunityId: 'plan-e2e-flip-opp',
    planId: 'pro',
    role: 'TENANT_OWNER',
  },
} as const satisfies Record<string, PlanFixture>;

const FIXTURES: readonly PlanFixture[] = [PLAN_E2E.ultra, PLAN_E2E.flip];

/**
 * M10 (Follow-up Documents) is what both specs point a browser at, and it is the only
 * module either of them needs switched on. Entitlement is two facts — this row plus the
 * plan — which is exactly the pair the specs are about.
 */
const MODULES = ['M10'] as const;

async function seatFixture(f: PlanFixture) {
  await prisma.tenant.upsert({
    where: { id: f.tenantId },
    update: {},
    create: {
      id: f.tenantId,
      name: f.tenantId,
      slug: f.tenantId,
      country: 'TR',
      orgType: 'SME',
    },
  });

  await prisma.workspace.upsert({
    where: { id: f.workspaceId },
    update: { slug: f.workspaceSlug },
    create: {
      id: f.workspaceId,
      tenantId: f.tenantId,
      name: f.workspaceSlug,
      slug: f.workspaceSlug,
    },
  });

  // Sign-in is passwordless and creates a user (and a tenant, and a workspace) for any
  // address it does not recognise — src/lib/auth.ts `authorize`. A fixture user that
  // does not exist before the spec signs in would therefore quietly get a tenant of its
  // own with no plan, and the spec would measure that instead.
  await prisma.user.upsert({
    where: { id: f.userId },
    update: { email: f.email },
    create: { id: f.userId, email: f.email, name: f.userId, locale: 'tr' },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: f.tenantId, userId: f.userId } },
    update: { role: f.role, workspaceIds: [f.workspaceId] },
    create: {
      userId: f.userId,
      tenantId: f.tenantId,
      role: f.role,
      workspaceIds: [f.workspaceId],
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: f.tenantId },
    // `update` is written out, not left empty: `module-plan-gate` leaves its tenant on
    // whatever plan its last test set, and a re-run must start from the seeded plan
    // rather than inherit that.
    update: { planId: f.planId, status: 'ACTIVE' },
    create: { tenantId: f.tenantId, planId: f.planId, status: 'ACTIVE' },
  });

  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: f.tenantId, moduleId } },
      update: { status: 'ON' },
      create: { tenantId: f.tenantId, moduleId, status: 'ON', changedBy: 'seed-plan-e2e' },
    });
  }

  await prisma.opportunity.upsert({
    where: { id: f.opportunityId },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      id: f.opportunityId,
      tenantId: f.tenantId,
      workspaceId: f.workspaceId,
      title: `Plan E2E — ${f.planId} fixture opportunity`,
      stage: 'G0',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });
}

export async function seed() {
  for (const f of FIXTURES) await seatFixture(f);
  console.log(
    `[seed-plan-e2e] ready — ultra=${PLAN_E2E.ultra.workspaceSlug} (${PLAN_E2E.ultra.planId}) ` +
      `flip=${PLAN_E2E.flip.workspaceSlug} (${PLAN_E2E.flip.planId})`,
  );
}

export async function rollback() {
  const tenantIds = FIXTURES.map((f) => f.tenantId);
  const userIds = FIXTURES.map((f) => f.userId);

  // Anything a spec wrote against these opportunities goes first: the specs drive real
  // pages, and a page that files a document or a decision would otherwise hold the
  // opportunity row down and leave the tenant behind.
  await prisma.followupDoc.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.gateDecision.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.opportunity.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.workspace.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  console.log('[seed-plan-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-plan-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-plan-e2e] failed:', e);
      process.exit(1);
    });
}

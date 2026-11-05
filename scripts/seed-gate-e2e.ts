/**
 * Seed the tenant-isolation fixture for the stage-gate end-to-end test, and roll it back.
 *
 * Two tenants, deliberately: A is the one the test signs in as, B exists only so there is a real
 * opportunity id in the database that A must not be able to gate. Without B the happy path proves
 * the button works but says nothing about whether `evaluateGate` would have evaluated somebody
 * else's row (TASK-MTQZMLLZE1I29).
 *
 * Idempotent: running it twice leaves the same rows. `--rollback` deletes exactly the fixed ids
 * below and nothing else.
 *
 *   pnpm tsx scripts/seed-gate-e2e.ts
 *   pnpm tsx scripts/seed-gate-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const GATE_E2E = {
  /** Tenant A — the signed-in tenant. */
  email: 'gate-e2e@fabrika.test',
  tenantId: 'gate-e2e-tenant-a',
  workspaceId: 'gate-e2e-workspace-a',
  workspaceSlug: 'gate-e2e-ws-a',
  userId: 'gate-e2e-user-a',
  opportunityId: 'gate-e2e-opportunity-a',
  /** Tenant B — never signed in as; only its id is used, as the id an attacker would guess. */
  otherTenantId: 'gate-e2e-tenant-b',
  otherWorkspaceId: 'gate-e2e-workspace-b',
  otherOpportunityId: 'gate-e2e-opportunity-b',
} as const;

export async function seed() {
  for (const [tenantId, slug] of [
    [GATE_E2E.tenantId, 'gate-e2e-a'],
    [GATE_E2E.otherTenantId, 'gate-e2e-b'],
  ] as const) {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: `Gate E2E ${slug}`, slug, country: 'TR', orgType: 'SME' },
    });
  }

  await prisma.workspace.upsert({
    where: { id: GATE_E2E.workspaceId },
    update: {},
    create: {
      id: GATE_E2E.workspaceId,
      tenantId: GATE_E2E.tenantId,
      name: 'Gate E2E A',
      slug: GATE_E2E.workspaceSlug,
    },
  });

  await prisma.workspace.upsert({
    where: { id: GATE_E2E.otherWorkspaceId },
    update: {},
    create: {
      id: GATE_E2E.otherWorkspaceId,
      tenantId: GATE_E2E.otherTenantId,
      name: 'Gate E2E B',
      slug: 'gate-e2e-ws-b',
    },
  });

  await prisma.user.upsert({
    where: { id: GATE_E2E.userId },
    update: { email: GATE_E2E.email },
    create: { id: GATE_E2E.userId, email: GATE_E2E.email, name: 'Gate E2E Owner', locale: 'tr' },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: GATE_E2E.tenantId, userId: GATE_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [GATE_E2E.workspaceId] },
    create: {
      userId: GATE_E2E.userId,
      tenantId: GATE_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [GATE_E2E.workspaceId],
    },
  });

  // The pipeline detail page — where the gate button lives — is an M5 route, and a tenant with
  // no `ModuleState` row reads as "module off": the page renders the module gate and the button
  // never exists. M5 is granted by every plan (src/lib/billing/catalog.ts PLAN_GRANTS), so the
  // row alone is enough and the fixture needs no subscription.
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: GATE_E2E.tenantId, moduleId: 'M5' } },
    update: { status: 'ON' },
    create: {
      tenantId: GATE_E2E.tenantId,
      moduleId: 'M5',
      status: 'ON',
      changedBy: 'seed-gate-e2e',
    },
  });

  // A stands at G1, so the detail button's next gate is G2 (NG-25). G2 rather than G0: G0 refuses
  // when the tenant has no scoring evidence on file, and a fixture tenant has none. G2 decides on seats, which the fixture can state outright — so the happy
  // path measures the gate running and filing a decision, not the scorer's evidence coverage.
  await prisma.opportunity.upsert({
    where: { id: GATE_E2E.opportunityId },
    update: { stage: 'G1', status: 'ACTIVE', deletedAt: null },
    create: {
      id: GATE_E2E.opportunityId,
      tenantId: GATE_E2E.tenantId,
      workspaceId: GATE_E2E.workspaceId,
      title: 'Gate E2E — tenant A opportunity',
      stage: 'G1',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });

  await prisma.opportunity.upsert({
    where: { id: GATE_E2E.otherOpportunityId },
    update: { stage: 'G2', status: 'ACTIVE', deletedAt: null },
    create: {
      id: GATE_E2E.otherOpportunityId,
      tenantId: GATE_E2E.otherTenantId,
      workspaceId: GATE_E2E.otherWorkspaceId,
      title: 'Gate E2E — tenant B opportunity (must stay untouchable)',
      stage: 'G2',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });

  // One CONFIRMED seat on each, so G2 ("all seats filled") passes and the gate has a stage to
  // move — a passing gate is what exercises the write path this task hardened.
  for (const [seatId, tenantId, opportunityId] of [
    ['gate-e2e-seat-a', GATE_E2E.tenantId, GATE_E2E.opportunityId],
    ['gate-e2e-seat-b', GATE_E2E.otherTenantId, GATE_E2E.otherOpportunityId],
  ] as const) {
    await prisma.consortiumSeat.upsert({
      where: { id: seatId },
      update: { status: 'CONFIRMED' },
      create: {
        id: seatId,
        tenantId,
        opportunityId,
        roleKey: 'coordinator',
        required: true,
        status: 'CONFIRMED',
      },
    });
  }

  // Start from "no decision filed", so a decision the test observes was written by the test.
  const cleared = await prisma.gateDecision.deleteMany({
    where: { opportunityId: { in: [GATE_E2E.opportunityId, GATE_E2E.otherOpportunityId] } },
  });

  console.log(
    `[seed-gate-e2e] ready — tenantA=${GATE_E2E.tenantId} oppA=${GATE_E2E.opportunityId} ` +
      `tenantB=${GATE_E2E.otherTenantId} oppB=${GATE_E2E.otherOpportunityId} ` +
      `clearedDecisions=${cleared.count}`,
  );
}

export async function rollback() {
  await prisma.gateDecision.deleteMany({
    where: { opportunityId: { in: [GATE_E2E.opportunityId, GATE_E2E.otherOpportunityId] } },
  });
  await prisma.consortiumSeat.deleteMany({
    where: { opportunityId: { in: [GATE_E2E.opportunityId, GATE_E2E.otherOpportunityId] } },
  });
  await prisma.opportunity.deleteMany({
    where: { id: { in: [GATE_E2E.opportunityId, GATE_E2E.otherOpportunityId] } },
  });
  await prisma.moduleState.deleteMany({
    where: { tenantId: { in: [GATE_E2E.tenantId, GATE_E2E.otherTenantId] } },
  });
  await prisma.membership.deleteMany({
    where: { userId: GATE_E2E.userId, tenantId: GATE_E2E.tenantId },
  });
  await prisma.user.deleteMany({ where: { id: GATE_E2E.userId } });
  await prisma.workspace.deleteMany({
    where: { id: { in: [GATE_E2E.workspaceId, GATE_E2E.otherWorkspaceId] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [GATE_E2E.tenantId, GATE_E2E.otherTenantId] } },
  });
  console.log('[seed-gate-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-gate-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-gate-e2e] failed:', e);
      process.exit(1);
    });
}

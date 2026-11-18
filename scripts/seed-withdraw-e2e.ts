/**
 * Seed the fixture for the withdraw ("vazgeç") end-to-end test (NG-15), and roll it back.
 *
 * Idempotent: running it twice leaves the same rows, and it clears the decision log and the
 * withdrawn status a previous run left, so the test always starts from "nothing withdrawn".
 * `--rollback` removes exactly what this script created — every delete is keyed on the fixed
 * ids below.
 *
 *   pnpm tsx scripts/seed-withdraw-e2e.ts
 *   pnpm tsx scripts/seed-withdraw-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const WITHDRAW_E2E = {
  email: 'withdraw-e2e@fabrika.test',
  tenantId: 'withdraw-e2e-tenant',
  workspaceId: 'withdraw-e2e-workspace',
  workspaceSlug: 'withdraw-e2e-ws',
  userId: 'withdraw-e2e-user',
  userName: 'Withdraw E2E Owner',
  /** The opportunity the test withdraws: ACTIVE, so it is withdrawable. */
  oppId: 'withdraw-e2e-opportunity',
  oppTitle: 'Withdraw E2E — opportunity to withdraw',
} as const;

export async function seed() {
  await prisma.tenant.upsert({
    where: { id: WITHDRAW_E2E.tenantId },
    update: {},
    create: {
      id: WITHDRAW_E2E.tenantId,
      name: 'Withdraw E2E',
      slug: 'withdraw-e2e',
      country: 'TR',
      orgType: 'SME',
    },
  });

  await prisma.workspace.upsert({
    where: { id: WITHDRAW_E2E.workspaceId },
    update: {},
    create: {
      id: WITHDRAW_E2E.workspaceId,
      tenantId: WITHDRAW_E2E.tenantId,
      name: 'Withdraw E2E',
      slug: WITHDRAW_E2E.workspaceSlug,
    },
  });

  await prisma.user.upsert({
    where: { id: WITHDRAW_E2E.userId },
    update: { email: WITHDRAW_E2E.email, name: WITHDRAW_E2E.userName },
    create: {
      id: WITHDRAW_E2E.userId,
      email: WITHDRAW_E2E.email,
      name: WITHDRAW_E2E.userName,
      locale: 'tr',
    },
  });

  // M5 is the module the detail page belongs to (see seed-archive-e2e.ts for why both facts
  // are needed). The `free` grant already includes M5.
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: WITHDRAW_E2E.tenantId, moduleId: 'M5' } },
    update: { status: 'ON' },
    create: {
      tenantId: WITHDRAW_E2E.tenantId,
      moduleId: 'M5',
      status: 'ON',
      changedBy: 'seed-withdraw-e2e',
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: WITHDRAW_E2E.tenantId, userId: WITHDRAW_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [WITHDRAW_E2E.workspaceId] },
    create: {
      userId: WITHDRAW_E2E.userId,
      tenantId: WITHDRAW_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [WITHDRAW_E2E.workspaceId],
    },
  });

  // Back to ACTIVE and not deleted: a previous run may have withdrawn it.
  await prisma.opportunity.upsert({
    where: { id: WITHDRAW_E2E.oppId },
    update: { title: WITHDRAW_E2E.oppTitle, status: 'ACTIVE', deletedAt: null, deletionReason: null },
    create: {
      id: WITHDRAW_E2E.oppId,
      tenantId: WITHDRAW_E2E.tenantId,
      workspaceId: WITHDRAW_E2E.workspaceId,
      title: WITHDRAW_E2E.oppTitle,
      stage: 'G0',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
      ownerId: WITHDRAW_E2E.userId,
    },
  });

  const clearedDecisions = await prisma.decisionLog.deleteMany({
    where: { tenantId: WITHDRAW_E2E.tenantId, opportunityId: WITHDRAW_E2E.oppId },
  });
  const clearedAudit = await prisma.auditEvent.deleteMany({
    where: { tenantId: WITHDRAW_E2E.tenantId, type: 'opportunity.withdrawn' },
  });

  console.log(
    `[seed-withdraw-e2e] ready — tenant=${WITHDRAW_E2E.tenantId} opportunity=${WITHDRAW_E2E.oppId} ` +
      `clearedDecisions=${clearedDecisions.count} clearedAuditEvents=${clearedAudit.count}`,
  );
}

export async function rollback() {
  await prisma.decisionLog.deleteMany({ where: { tenantId: WITHDRAW_E2E.tenantId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: WITHDRAW_E2E.tenantId } });
  await prisma.opportunity.deleteMany({ where: { tenantId: WITHDRAW_E2E.tenantId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: WITHDRAW_E2E.tenantId } });
  await prisma.membership.deleteMany({
    where: { userId: WITHDRAW_E2E.userId, tenantId: WITHDRAW_E2E.tenantId },
  });
  await prisma.user.deleteMany({ where: { id: WITHDRAW_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: WITHDRAW_E2E.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: WITHDRAW_E2E.tenantId } });
  console.log('[seed-withdraw-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-withdraw-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-withdraw-e2e] failed:', e);
      process.exit(1);
    });
}

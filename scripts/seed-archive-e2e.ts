/**
 * Seed the fixture for the opportunity-archive end-to-end test, and roll it back.
 *
 * Idempotent: running it twice leaves the same rows, and it clears the `deletedAt` a previous
 * run stamped so the test always starts from "nothing archived". `--rollback` removes exactly
 * what this script created and nothing else — every delete is keyed on the fixed ids below.
 *
 *   pnpm tsx scripts/seed-archive-e2e.ts
 *   pnpm tsx scripts/seed-archive-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const ARCHIVE_E2E = {
  email: 'archive-e2e@fabrika.test',
  tenantId: 'archive-e2e-tenant',
  workspaceId: 'archive-e2e-workspace',
  workspaceSlug: 'archive-e2e-ws',
  userId: 'archive-e2e-user',
  userName: 'Archive E2E Owner',
  /** The one that gets archived. */
  archivedOppId: 'archive-e2e-opportunity',
  archivedOppTitle: 'Archive E2E — opportunity to archive',
  /** The control: stays on the board, so a disappearing card proves the archive, not a bug. */
  keptOppId: 'archive-e2e-opportunity-kept',
  keptOppTitle: 'Archive E2E — opportunity that stays',
} as const;

export async function seed() {
  await prisma.tenant.upsert({
    where: { id: ARCHIVE_E2E.tenantId },
    update: {},
    create: {
      id: ARCHIVE_E2E.tenantId,
      name: 'Archive E2E',
      slug: 'archive-e2e',
      country: 'TR',
      orgType: 'SME',
    },
  });

  await prisma.workspace.upsert({
    where: { id: ARCHIVE_E2E.workspaceId },
    update: {},
    create: {
      id: ARCHIVE_E2E.workspaceId,
      tenantId: ARCHIVE_E2E.tenantId,
      name: 'Archive E2E',
      slug: ARCHIVE_E2E.workspaceSlug,
    },
  });

  await prisma.user.upsert({
    where: { id: ARCHIVE_E2E.userId },
    update: { email: ARCHIVE_E2E.email, name: ARCHIVE_E2E.userName },
    create: {
      id: ARCHIVE_E2E.userId,
      email: ARCHIVE_E2E.email,
      name: ARCHIVE_E2E.userName,
      locale: 'tr',
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: ARCHIVE_E2E.tenantId, userId: ARCHIVE_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [ARCHIVE_E2E.workspaceId] },
    create: {
      userId: ARCHIVE_E2E.userId,
      tenantId: ARCHIVE_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [ARCHIVE_E2E.workspaceId],
    },
  });

  for (const [id, title] of [
    [ARCHIVE_E2E.archivedOppId, ARCHIVE_E2E.archivedOppTitle],
    [ARCHIVE_E2E.keptOppId, ARCHIVE_E2E.keptOppTitle],
  ] as const) {
    await prisma.opportunity.upsert({
      where: { id },
      // `deletedAt: null` on update: a previous run archived one of these, and the test has to
      // start from an opportunity that is actually on the board.
      update: { title, deletedAt: null, deletionReason: null },
      create: {
        id,
        tenantId: ARCHIVE_E2E.tenantId,
        workspaceId: ARCHIVE_E2E.workspaceId,
        title,
        stage: 'G0',
        status: 'ACTIVE',
        intendedRole: 'coordinator',
        ownerId: ARCHIVE_E2E.userId,
      },
    });
  }

  // The effort tab must open on its empty state, so a previous run's logged row goes.
  const clearedEfforts = await prisma.effort.deleteMany({
    where: { tenantId: ARCHIVE_E2E.tenantId },
  });
  const clearedAudit = await prisma.auditEvent.deleteMany({
    where: { tenantId: ARCHIVE_E2E.tenantId, type: 'opportunity.archived' },
  });

  console.log(
    `[seed-archive-e2e] ready — tenant=${ARCHIVE_E2E.tenantId} ` +
      `opportunities=${ARCHIVE_E2E.archivedOppId},${ARCHIVE_E2E.keptOppId} ` +
      `clearedEfforts=${clearedEfforts.count} clearedAuditEvents=${clearedAudit.count}`,
  );
}

export async function rollback() {
  await prisma.effort.deleteMany({ where: { tenantId: ARCHIVE_E2E.tenantId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: ARCHIVE_E2E.tenantId } });
  await prisma.opportunity.deleteMany({ where: { tenantId: ARCHIVE_E2E.tenantId } });
  await prisma.membership.deleteMany({
    where: { userId: ARCHIVE_E2E.userId, tenantId: ARCHIVE_E2E.tenantId },
  });
  await prisma.user.deleteMany({ where: { id: ARCHIVE_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: ARCHIVE_E2E.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: ARCHIVE_E2E.tenantId } });
  console.log('[seed-archive-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-archive-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-archive-e2e] failed:', e);
      process.exit(1);
    });
}

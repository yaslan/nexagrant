/**
 * Fixture for the "Aramayı Kaydet" end-to-end test, and its rollback.
 *
 * Its own tenant on purpose. The row the test is about is a `SavedSearch`, and
 * `alerts-daily` reads `SavedSearch` across every tenant with `notify: true`
 * — so a spec that saved into `demo-tenant` would both count rows other agents
 * had left behind and leave rows of its own in the cron's inbox
 * (docs/E2E_TESTING.md §3.3, rule 1).
 *
 * `/calls` is not module-gated, so the fixture needs no `ModuleState` row: a
 * tenant, a workspace, a user and the membership that ties them together is the
 * whole of what the page asks for. The user must exist before the test signs in
 * — an unknown e-mail makes itself a brand-new tenant (docs/E2E_TESTING.md §3.5).
 *
 * Idempotent: running it twice leaves the same rows. `--rollback` deletes
 * exactly the ids below and nothing else.
 *
 *   pnpm tsx scripts/seed-saved-search-e2e.ts
 *   pnpm tsx scripts/seed-saved-search-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const SAVED_SEARCH_E2E = {
  email: 'saved-search-e2e@fabrika.test',
  tenantId: 'saved-search-e2e-tenant',
  workspaceId: 'saved-search-e2e-workspace',
  workspaceSlug: 'saved-search-e2e-ws',
  userId: 'saved-search-e2e-user',
} as const;

export async function seed() {
  await prisma.tenant.upsert({
    where: { id: SAVED_SEARCH_E2E.tenantId },
    update: {},
    create: {
      id: SAVED_SEARCH_E2E.tenantId,
      name: 'Saved Search E2E',
      slug: 'saved-search-e2e',
      country: 'TR',
      orgType: 'SME',
    },
  });

  await prisma.workspace.upsert({
    where: { id: SAVED_SEARCH_E2E.workspaceId },
    update: {},
    create: {
      id: SAVED_SEARCH_E2E.workspaceId,
      tenantId: SAVED_SEARCH_E2E.tenantId,
      name: 'Saved Search E2E',
      slug: SAVED_SEARCH_E2E.workspaceSlug,
    },
  });

  await prisma.user.upsert({
    where: { id: SAVED_SEARCH_E2E.userId },
    update: { email: SAVED_SEARCH_E2E.email },
    create: {
      id: SAVED_SEARCH_E2E.userId,
      email: SAVED_SEARCH_E2E.email,
      name: 'Saved Search E2E Owner',
      locale: 'tr',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: SAVED_SEARCH_E2E.tenantId,
        userId: SAVED_SEARCH_E2E.userId,
      },
    },
    update: { role: 'TENANT_OWNER', workspaceIds: [SAVED_SEARCH_E2E.workspaceId] },
    create: {
      userId: SAVED_SEARCH_E2E.userId,
      tenantId: SAVED_SEARCH_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [SAVED_SEARCH_E2E.workspaceId],
    },
  });

  // Start from "nothing saved", so every row the test counts was written by the
  // click it just performed — the assertion is a count, and a leftover row from
  // an interrupted run would make a broken button look like a working one.
  const cleared = await prisma.savedSearch.deleteMany({
    where: { tenantId: SAVED_SEARCH_E2E.tenantId },
  });

  console.log(
    `[seed-saved-search-e2e] ready — tenant=${SAVED_SEARCH_E2E.tenantId} ` +
      `ws=${SAVED_SEARCH_E2E.workspaceSlug} user=${SAVED_SEARCH_E2E.email} ` +
      `clearedSearches=${cleared.count}`,
  );
}

export async function rollback() {
  const searches = await prisma.savedSearch.deleteMany({
    where: { tenantId: SAVED_SEARCH_E2E.tenantId },
  });
  await prisma.membership.deleteMany({
    where: { userId: SAVED_SEARCH_E2E.userId, tenantId: SAVED_SEARCH_E2E.tenantId },
  });
  await prisma.user.deleteMany({ where: { id: SAVED_SEARCH_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: SAVED_SEARCH_E2E.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: SAVED_SEARCH_E2E.tenantId } });
  console.log(`[seed-saved-search-e2e] rolled back — removedSearches=${searches.count}`);
}

const isMain = process.argv[1]?.includes('seed-saved-search-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-saved-search-e2e] failed:', e);
      process.exit(1);
    });
}

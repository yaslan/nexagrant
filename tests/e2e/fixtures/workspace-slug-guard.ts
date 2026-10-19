import type { Page } from '@playwright/test';
import { withSystemScope } from '../../../src/lib/system-scope';
import { signInAs } from './session';

/**
 * Two tenants of its own for the `[workspace]` slug guard spec (TASK-MUUS62C4SC7H5).
 *
 * Tenant A holds two workspaces; the user's membership covers only the first, so
 * the second is "same tenant, outside the membership". Tenant B's workspace is the
 * "another tenant's slug". Nothing is written into demo-tenant, and teardown
 * deletes only these rows.
 */
export const WSG_TENANT_A = 'wsg-e2e-tenant-a';
export const WSG_TENANT_B = 'wsg-e2e-tenant-b';
export const WSG_OWN = { id: 'wsg-e2e-own-ws', slug: 'wsg-e2e-own' };
export const WSG_UNCOVERED = { id: 'wsg-e2e-uncovered-ws', slug: 'wsg-e2e-uncovered' };
export const WSG_FOREIGN = { id: 'wsg-e2e-foreign-ws', slug: 'wsg-e2e-foreign' };
const USER_ID = 'wsg-e2e-user';
const USER_EMAIL = 'wsg-e2e@fabrika.test';

export async function setupWorkspaceSlugGuard() {
  await withSystemScope('platform-admin', 'e2e.workspace-slug-guard.setup', async (tx) => {
    for (const tenantId of [WSG_TENANT_A, WSG_TENANT_B]) {
      await tx.tenant.upsert({
        where: { id: tenantId },
        create: { id: tenantId, name: `${tenantId} (internal)`, slug: tenantId, country: 'TR', orgType: 'SME' },
        update: {},
      });
    }
    for (const [tenantId, ws] of [
      [WSG_TENANT_A, WSG_OWN],
      [WSG_TENANT_A, WSG_UNCOVERED],
      [WSG_TENANT_B, WSG_FOREIGN],
    ] as const) {
      await tx.workspace.upsert({
        where: { id: ws.id },
        create: { id: ws.id, tenantId, slug: ws.slug, name: ws.slug },
        update: { tenantId, slug: ws.slug, deletedAt: null },
      });
    }
    await tx.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: USER_EMAIL, name: 'workspace slug guard E2E', locale: 'tr' },
      update: { email: USER_EMAIL },
    });
    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: WSG_TENANT_A, userId: USER_ID } },
      create: { tenantId: WSG_TENANT_A, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WSG_OWN.id] },
      update: { role: 'TENANT_OWNER', workspaceIds: [WSG_OWN.id] },
    });
  });
}

export async function teardownWorkspaceSlugGuard() {
  const tenants = [WSG_TENANT_A, WSG_TENANT_B];
  await withSystemScope('platform-admin', 'e2e.workspace-slug-guard.teardown', async (tx) => {
    await tx.membership.deleteMany({ where: { tenantId: { in: tenants } } });
    await tx.workspace.deleteMany({ where: { tenantId: { in: tenants } } });
    await tx.user.deleteMany({ where: { id: USER_ID } });
    await tx.tenant.deleteMany({ where: { id: { in: tenants } } });
  });
}

/** Session cookie for the tenant-A user; the jwt callback reads the membership from the DB. */
export async function signInAsWorkspaceSlugGuardUser(page: Page) {
  await signInAs(page, { id: USER_ID, email: USER_EMAIL, tenantId: WSG_TENANT_A, role: 'TENANT_OWNER' });
}

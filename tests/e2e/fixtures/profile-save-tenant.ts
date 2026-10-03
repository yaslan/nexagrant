import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { withSystemScope } from '../../../src/lib/system-scope';

/**
 * The tenants `tests/e2e/e2e-profile-save.spec.ts` runs in (TASK-MUPVLWSIPC5WU).
 *
 * PS_TENANT is the signed-in user's own tenant; it starts with no TenantProfile
 * row, so the first save creates one. PS_OTHER_TENANT has a stored profile of
 * its own: the page must never show it, since the profile is read from the
 * session's tenant only.
 *
 * Created before the spec and deleted after (TenantProfile and AuditEvent go
 * with the tenant: onDelete Cascade), so the suite leaves the database as it
 * found it.
 */
export const PS_TENANT = 'ps-e2e-tenant';
export const PS_OTHER_TENANT = 'ps-e2e-other-tenant';
export const PS_WORKSPACE_ID = 'ps-e2e-workspace';
export const PS_WORKSPACE = 'ps-e2e';
export const PS_USER_ID = 'ps-e2e-user';
export const PS_EMAIL = 'ps-e2e@profile.test';
export const PS_OTHER_CAPABILITIES = 'ps-e2e other tenant capabilities — must never be shown';

export async function setupProfileSaveTenant() {
  await withSystemScope('platform-admin', 'e2e.profile-save.setup', async (tx) => {
    await tx.tenant.upsert({
      where: { id: PS_TENANT },
      create: { id: PS_TENANT, name: `profile save e2e (${PS_TENANT})`, slug: PS_TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await tx.subscription.upsert({
      where: { tenantId: PS_TENANT },
      create: { tenantId: PS_TENANT, planId: 'ultra', status: 'ACTIVE' },
      update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
    });
    await tx.tenant.upsert({
      where: { id: PS_OTHER_TENANT },
      create: { id: PS_OTHER_TENANT, name: `profile save e2e (${PS_OTHER_TENANT})`, slug: PS_OTHER_TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await tx.subscription.upsert({
      where: { tenantId: PS_OTHER_TENANT },
      create: { tenantId: PS_OTHER_TENANT, planId: 'ultra', status: 'ACTIVE' },
      update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
    });
    // A leftover row from an interrupted run would make the first save an update.
    await tx.tenantProfile.deleteMany({ where: { tenantId: PS_TENANT } });
    await tx.tenantProfile.upsert({
      where: { tenantId: PS_OTHER_TENANT },
      create: {
        tenantId: PS_OTHER_TENANT,
        capabilities: PS_OTHER_CAPABILITIES,
        keywords: ['ps-e2e-other'],
        trlRange: [1, 2],
        naceCodes: [],
        preferredRoles: [],
      },
      update: { capabilities: PS_OTHER_CAPABILITIES },
    });
    await tx.workspace.upsert({
      where: { id: PS_WORKSPACE_ID },
      create: { id: PS_WORKSPACE_ID, tenantId: PS_TENANT, name: 'profile save e2e', slug: PS_WORKSPACE },
      update: { slug: PS_WORKSPACE },
    });
    await tx.user.upsert({
      where: { id: PS_USER_ID },
      create: { id: PS_USER_ID, email: PS_EMAIL, name: 'Profile Save E2E', locale: 'tr' },
      update: { email: PS_EMAIL },
    });
    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: PS_TENANT, userId: PS_USER_ID } },
      create: { tenantId: PS_TENANT, userId: PS_USER_ID, role: 'TENANT_OWNER', workspaceIds: [PS_WORKSPACE_ID] },
      update: { role: 'TENANT_OWNER', workspaceIds: [PS_WORKSPACE_ID] },
    });
  });
}

export async function teardownProfileSaveTenant() {
  const tenantIds = [PS_TENANT, PS_OTHER_TENANT];
  await withSystemScope('platform-admin', 'e2e.profile-save.teardown', async (tx) => {
    await tx.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.workspace.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.user.deleteMany({ where: { id: PS_USER_ID } });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
  await prisma.$disconnect();
}

/** The profile row as stored, read past the page. */
export async function readStoredProfile() {
  return withSystemScope('platform-admin', 'e2e.profile-save.read', (tx) =>
    tx.tenantProfile.findUnique({
      where: { tenantId: PS_TENANT },
      select: { capabilities: true, keywords: true, trlRange: true },
    })
  );
}

/** Real sign-in through the login form, landing on `target`. */
export async function signInAsProfileSaveUser(page: Page, target: string) {
  // The cookie banner is a full-screen alertdialog that swallows the sign-in click.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(PS_EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
}

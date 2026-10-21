import 'dotenv/config';
import { test, expect } from '@playwright/test';

import { withTenant } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { getEntitlements } from '../../src/lib/billing';
import { FALLBACK_PLAN_ID, grantsFor } from '../../src/lib/billing/catalog';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs, E2E_IDENTITIES } from './fixtures/session';

/**
 * FA-49 (TASK-MVFMK08Z447OR) — the two screens behind the three call sites,
 * on the rendered page. Meaningful only when the server runs as `fabrika_app`
 * (E2E_DATABASE_URL): under the BYPASSRLS owner every unscoped read already
 * returns every row and both screens are right by accident.
 *
 *   /admin/tenants           member/workspace counts (Membership, Workspace are RLS)
 *   /settings/billing        seats of the plan the tenant pays for, not the free fallback
 */

const SHOTS = shotsDir('TASK-MVFMK08Z447OR-screenshots');
const TENANT_ID = 'demo-tenant';
// Not E2E_IDENTITIES.platformAdmin: its role is SUPER_ADMIN, which is no
// Membership role, so seeding it is refused. The platform right is the User
// column, not the membership role.
const ADMIN = {
  userId: 'e2e-fa49-admin',
  email: 'fa49-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: TENANT_ID,
  isPlatformAdmin: true,
};
const OWNER = { ...E2E_IDENTITIES.tenantOwner, userId: 'e2e-fa49-owner', email: 'fa49-owner@e2e.fabrika.test' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await seedIdentity({ ...ADMIN, workspaceIds: [] });
  await seedIdentity({ ...OWNER, workspaceIds: [] });
});

test.afterAll(() => cleanupIdentity([ADMIN.userId, OWNER.userId]));

test('admin tenants shows the real member and workspace counts', async ({ page }) => {
  const expected = await withSystemScope('platform-admin', 'e2e.fa49', (tx) =>
    tx.tenant.findUniqueOrThrow({
      where: { id: TENANT_ID },
      select: { slug: true, _count: { select: { users: true, workspaces: true } } },
    })
  );
  expect(expected._count.users).toBeGreaterThan(0);

  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role });
  await page.goto('/tr/admin/tenants');
  const row = page.locator('tr', { has: page.locator('td', { hasText: new RegExp(`^${expected.slug}$`) }) });
  await expect(row.locator('td').nth(5)).toHaveText(String(expected._count.users));
  await expect(row.locator('td').nth(6)).toHaveText(String(expected._count.workspaces));
  await page.screenshot({ path: `${SHOTS}/admin-tenants.png`, fullPage: true });
});

test('billing shows the seats of the plan the tenant pays for', async ({ page }) => {
  const entitled = await withTenant(TENANT_ID, (tx) => getEntitlements(TENANT_ID, tx));
  expect(entitled.seats).not.toBe(grantsFor(FALLBACK_PLAN_ID)?.seats);

  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
  await page.goto('/tr/main/settings/billing');
  await expect(page.getByTestId('settings-metric-seats-total')).toHaveText(`/ ${entitled.seats}`);
  await page.screenshot({ path: `${SHOTS}/billing.png`, fullPage: true });
});

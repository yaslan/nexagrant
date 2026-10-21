import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MVCH26OXNVLKR — an internal plan, assigned and taken back with clicks.
 *
 * The tenant is its own (no subscription = Discover, M1 switched ON in
 * `ModuleState`), so the only thing that can open or close M1 here is the plan:
 * Discover does not grant M1, Pro does. The operator assigns Pro from
 * Admin > Tenants with a note, the tenant's partners page opens; the operator
 * picks Discover, the page locks again with the plan refusal. Both changes
 * must leave an audit row with old → new and the note.
 */

const SHOTS = shotsDir('TASK-MVCH26OXNVLKR-screenshots');
const TENANT = 'ip-e2e-tenant';
const WORKSPACE = { id: 'ip-e2e-workspace', slug: 'ip-e2e', name: 'internal plan e2e' };
const OWNER = { userId: 'ip-e2e-owner', email: 'ip-e2e-owner@fabrika.test', role: 'TENANT_OWNER' as const };
const ADMIN = {
  userId: 'ip-e2e-admin',
  email: 'ip-e2e-admin@fabrika.test',
  name: 'Internal Plan Admin',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  workspaceIds: [] as string[],
  isPlatformAdmin: true,
};
const PARTNERS_URL = `/tr/${WORKSPACE.slug}/partners`;
const DETAIL_URL = `/tr/admin/tenants/${TENANT}`;

// Tenant tables sit behind RLS, so the fixture reads and writes them in the system scope.
async function teardown() {
  await cleanupIdentity([OWNER.userId, ADMIN.userId]);
  await withSystemScope('platform-admin', 'e2e.internal-plan.cleanup', async (tx) => {
    await tx.auditEvent.deleteMany({ where: { tenantId: TENANT } });
    await tx.planAssignment.deleteMany({ where: { tenantId: TENANT } });
    await tx.subscription.deleteMany({ where: { tenantId: TENANT } });
    await tx.moduleState.deleteMany({ where: { tenantId: TENANT } });
    await tx.workspace.deleteMany({ where: { tenantId: TENANT } });
    await tx.tenant.deleteMany({ where: { id: TENANT } });
  });
}

// Filtered: Next's route announcer is a role=alert node too.
const planLock = (page: import('@playwright/test').Page) =>
  page.getByRole('alert').filter({ hasText: 'aboneliğinizin kapsamı dışında' });

async function signInOwner(page: import('@playwright/test').Page) {
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: TENANT, role: OWNER.role });
}

async function signInAdmin(page: import('@playwright/test').Page) {
  await signInAs(page, {
    id: ADMIN.userId,
    email: ADMIN.email,
    name: ADMIN.name,
    tenantId: ADMIN.tenantId,
    role: ADMIN.role,
    isPlatformAdmin: true,
  });
}

async function assign(page: import('@playwright/test').Page, planId: string, note: string) {
  await signInAdmin(page);
  await page.goto(DETAIL_URL);
  await page.getByTestId('internal-plan-select').selectOption(planId);
  // The note is mandatory: the button stays off until there is one.
  await expect(page.getByTestId('internal-plan-submit')).toBeDisabled();
  await page.getByTestId('internal-plan-note').fill(note);
  await page.getByTestId('internal-plan-submit').click();
  await expect(page.getByTestId('internal-plan-notice')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('internal plan assignment from Admin > Tenants', () => {
  test.beforeAll(async () => {
    await teardown();
    await withSystemScope('platform-admin', 'e2e.internal-plan.setup', async (tx) => {
      await tx.tenant.create({
        data: { id: TENANT, name: 'Internal Plan E2E', slug: TENANT, country: 'TR', orgType: 'SME' },
      });
      await tx.moduleState.create({
        data: { tenantId: TENANT, moduleId: 'M1', status: 'ON', changedBy: 'internal-plan e2e fixture' },
      });
    });
    await seedIdentity({ ...OWNER, tenantId: TENANT }, WORKSPACE);
    await seedIdentity(ADMIN);
  });

  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  test('on Discover, M1 is locked behind the plan', async ({ page }) => {
    await signInOwner(page);
    await page.goto(PARTNERS_URL);
    await expect(planLock(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-m1-locked-discover.png`, fullPage: true });
  });

  test('the operator assigns Pro with a note; the list shows the internal badge', async ({ page }) => {
    await assign(page, 'pro', 'M1 kilit testi (e2e)');
    await expect(page.getByTestId('internal-plan-notice')).toHaveText('İç plan atandı.');
    await expect(page.getByTestId('tenant-current-plan')).toContainText('Pro');
    await expect(page.getByTestId('internal-plan-history')).toContainText('M1 kilit testi (e2e)');
    await page.screenshot({ path: `${SHOTS}/02-admin-assigned-pro.png`, fullPage: true });

    // Phone width: the form and history must fit without a horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SHOTS}/02b-admin-assigned-pro-390.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/tr/admin/tenants');
    await expect(page.getByTestId(`tenant-internal-${TENANT}`)).toContainText('Pro');
    await page.screenshot({ path: `${SHOTS}/03-tenant-list-internal-badge.png`, fullPage: true });
  });

  test('on the internal Pro plan, M1 opens', async ({ page }) => {
    await signInOwner(page);
    await page.goto(PARTNERS_URL);
    // The page itself rendered, not just an absent lock (an error page has no lock either).
    await expect(page.getByRole('heading', { level: 1 })).toContainText('M1');
    await expect(planLock(page)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/04-m1-open-pro.png`, fullPage: true });
  });

  test('back to Discover: M1 locks again and both changes are audited', async ({ page }) => {
    await assign(page, 'free', 'test bitti (e2e)');
    await expect(page.getByTestId('internal-plan-notice')).toHaveText("İç plan geri alındı; kiracı Discover'a döndü.");
    await page.screenshot({ path: `${SHOTS}/05-admin-revoked.png`, fullPage: true });

    await signInOwner(page);
    await page.goto(PARTNERS_URL);
    await expect(planLock(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-m1-locked-again.png`, fullPage: true });

    const audit = await withSystemScope('platform-admin', 'e2e.internal-plan.audit', (tx) =>
      tx.auditEvent.findMany({
        where: { tenantId: TENANT, type: { startsWith: 'plan.internal.' } },
        orderBy: { createdAt: 'asc' },
        select: { type: true, actorId: true, data: true },
      })
    );
    expect(audit).toMatchObject([
      { type: 'plan.internal.assigned', actorId: ADMIN.userId, data: { before: 'free', after: 'pro', note: 'M1 kilit testi (e2e)' } },
      { type: 'plan.internal.revoked', actorId: ADMIN.userId, data: { before: 'pro', after: 'free', note: 'test bitti (e2e)' } },
    ]);
  });
});

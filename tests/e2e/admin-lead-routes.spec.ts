import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * NG-168 — platform admin maps a province to a consultancy on Admin > Lead routing.
 *
 * One click path: pick the consultancy for Samsun, save, reload. The mapping must still be
 * there after the reload and in the database (it is a platform-level row, read in the system
 * scope). The same screen is checked in English. The unmatched-lead list is covered by its
 * empty state here; a consented unmatched lead needs the readiness form and is not seeded.
 */

const SHOTS = shotsDir('NG-168-screenshots');
const PROVINCE = 'Samsun';
const TENANT_ID = 'lr-e2e-consultancy';
const TENANT_NAME = 'Lead Routing E2E Kuruluş';
const ADMIN = {
  userId: 'lr-e2e-admin',
  email: 'lr-e2e-admin@fabrika.test',
  name: 'Lead Routing Admin',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  workspaceIds: [] as string[],
  isPlatformAdmin: true,
};

async function teardown() {
  await cleanupIdentity([ADMIN.userId]);
  await withSystemScope('platform-admin', 'e2e.lead-routes.cleanup', async (tx) => {
    await tx.auditEvent.deleteMany({ where: { type: { startsWith: 'lead-route.' }, target: PROVINCE } });
    await tx.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
    await tx.tenant.deleteMany({ where: { id: TENANT_ID } });
  });
}

async function signInAdmin(page: Page) {
  await signInAs(page, {
    id: ADMIN.userId,
    email: ADMIN.email,
    name: ADMIN.name,
    tenantId: ADMIN.tenantId,
    role: ADMIN.role,
    isPlatformAdmin: true,
  });
}

/** The table row of the province; the province name is unique among the 81 rows. */
const provinceRow = (page: Page) => page.getByRole('row').filter({ hasText: PROVINCE });

test.describe.configure({ mode: 'serial' });

test.describe('province → consultancy mapping (Admin > Lead routing)', () => {
  test.beforeAll(async () => {
    await teardown();
    await withSystemScope('platform-admin', 'e2e.lead-routes.setup', async (tx) => {
      await tx.tenant.create({
        data: { id: TENANT_ID, name: TENANT_NAME, slug: TENANT_ID, country: 'TR', orgType: 'CONSULTANCY' },
      });
    });
    await seedIdentity(ADMIN);
  });

  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  test('TR: the admin maps Samsun to a consultancy, saves, and the mapping survives a reload', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/tr/admin/lead-routes');

    const select = page.getByLabel(`${PROVINCE} için danışmanlık kuruluşu`);
    await expectHydrated(select);
    await expect(provinceRow(page)).toContainText('Eşlenmemiş');
    await page.screenshot({ path: `${SHOTS}/01-tr-before-save.png`, fullPage: true });

    await select.selectOption({ label: TENANT_NAME });
    await provinceRow(page).getByRole('button', { name: 'Kaydet' }).click();
    await expect(provinceRow(page).getByRole('status')).toHaveText(`${PROVINCE} → ${TENANT_NAME} kaydedildi.`);
    await expect(provinceRow(page)).toContainText('Aktif');

    // The mapping is in the database, not only on screen.
    const saved = await withSystemScope('platform-admin', 'e2e.lead-routes.check', (tx) =>
      tx.provinceLeadRoute.findFirst({ where: { province: PROVINCE, active: true }, select: { targetTenantId: true, updatedBy: true } })
    );
    expect(saved?.targetTenantId).toBe(TENANT_ID);
    expect(saved?.updatedBy).toBe(ADMIN.userId);

    // Reload: the same page, read again from the server, must show the saved tenant and status.
    await page.reload();
    const after = page.getByLabel(`${PROVINCE} için danışmanlık kuruluşu`);
    await expectHydrated(after);
    await expect(after).toHaveValue(TENANT_ID);
    await expect(provinceRow(page)).toContainText('Aktif');
    await expect(provinceRow(page)).toContainText(ADMIN.name);
    await page.screenshot({ path: `${SHOTS}/02-tr-after-reload.png`, fullPage: true });
  });

  test('EN: the same screen in English shows the saved mapping and the unmatched list', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/en/admin/lead-routes');

    const select = page.getByLabel(`Consultancy for ${PROVINCE}`);
    await expectHydrated(select);
    await expect(page.getByRole('heading', { name: 'Lead routing: province → consultancy' })).toBeVisible();
    await expect(select).toHaveValue(TENANT_ID);
    await expect(provinceRow(page)).toContainText('Active');
    await expect(page.getByText('No unmatched leads.')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-en-after-reload.png`, fullPage: true });
  });
});

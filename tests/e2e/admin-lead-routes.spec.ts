import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * NG-168 / NG-172 — platform admin maps a province to a consultancy on Admin > Lead routing.
 *
 * Every test is self-contained: it runs alone with `--grep`, and in any order. The describe
 * `beforeAll` seeds the consultancy, the admin and one consented unmatched lead (no province, so
 * it sits in the worklist without touching the Samsun row); each test resets the Samsun route itself.
 */

const SHOTS = shotsDir('NG-172-evidence');
const PROVINCE = 'Samsun';
const TENANT_ID = 'lr-e2e-consultancy';
const TENANT_NAME = 'Lead Routing E2E Kuruluş';
const LEAD_ID = 'lr-e2e-lead';
const LEAD_EMAIL = 'lr-e2e-lead@fabrika.test';
const ADMIN = {
  userId: 'lr-e2e-admin',
  email: 'lr-e2e-admin@fabrika.test',
  name: 'Lead Routing Admin',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  workspaceIds: [] as string[],
  isPlatformAdmin: true,
};

/** Removes the Samsun route and its audit rows; the test starts with Samsun unmapped. */
async function resetSamsunRoute() {
  await withSystemScope('platform-admin', 'e2e.lead-routes.reset', async (tx) => {
    await tx.auditEvent.deleteMany({ where: { type: { startsWith: 'lead-route.' }, target: PROVINCE } });
    await tx.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
  });
}

async function teardown() {
  await cleanupIdentity([ADMIN.userId]);
  await withSystemScope('platform-admin', 'e2e.lead-routes.cleanup', async (tx) => {
    await tx.publicLead.deleteMany({ where: { email: LEAD_EMAIL } });
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

/** The table row of the province; the province name is unique among the 81 map rows. */
const provinceRow = (page: Page) => page.getByRole('row').filter({ hasText: PROVINCE });
/** The worklist row of the seeded lead (province empty, so it does not match a map row). */
const leadRow = (page: Page) => page.getByRole('row').filter({ hasText: LEAD_EMAIL });

test.describe.configure({ mode: 'serial' });

test.describe('province → consultancy mapping (Admin > Lead routing)', () => {
  test.beforeAll(async () => {
    await teardown();
    await withSystemScope('platform-admin', 'e2e.lead-routes.setup', async (tx) => {
      await tx.tenant.create({
        data: { id: TENANT_ID, name: TENANT_NAME, slug: TENANT_ID, country: 'TR', orgType: 'CONSULTANCY' },
      });
      await tx.publicLead.create({
        data: {
          id: LEAD_ID,
          name: 'Lead Routing Lead',
          email: LEAD_EMAIL,
          organisation: 'Lead Routing Org',
          readinessLevel: 'gelisen',
          consentVersion: 'e2e',
          consentAt: new Date(),
          transferConsent: true,
          transferConsentVersion: 'e2e',
          transferConsentAt: new Date(),
          routeStatus: 'unmatched',
          routeReason: 'province_missing',
          routedAt: new Date(),
          source: 'e2e',
          locale: 'tr',
        },
      });
    });
    await seedIdentity(ADMIN);
  });

  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  test('TR: the admin maps Samsun, saves, reloads, then deactivates and the select resets', async ({ page }) => {
    await resetSamsunRoute();
    await signInAdmin(page);
    await page.goto('/tr/admin/lead-routes');

    const select = page.getByLabel(`${PROVINCE} için danışmanlık kuruluşu`);
    await expectHydrated(select);
    await expect(provinceRow(page)).toContainText('Eşlenmemiş');
    // B1: the readiness level column is in the worklist and shows the stored level.
    await expect(page.getByRole('columnheader', { name: 'Karne düzeyi' })).toBeVisible();
    await expect(leadRow(page)).toContainText('Gelişen');
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

    // B3 regression: after deactivation the server sends no tenant; the select must fall back to the
    // placeholder (not keep Samsun's old tenant) and Save must be disabled. The feedback text survives.
    await provinceRow(page).getByRole('button', { name: 'Pasifleştir' }).click();
    await expect(provinceRow(page).getByRole('status')).toHaveText(`${PROVINCE} pasifleştirildi.`);
    await expect(provinceRow(page)).toContainText('Pasif');
    await expect(page.getByLabel(`${PROVINCE} için danışmanlık kuruluşu`)).toHaveValue('');
    await expect(provinceRow(page).getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/04-tr-after-deactivate.png`, fullPage: true });
  });

  test('EN: the same screen in English shows the saved mapping and the readiness column', async ({ page }) => {
    await resetSamsunRoute();
    await withSystemScope('platform-admin', 'e2e.lead-routes.en-setup', (tx) =>
      tx.provinceLeadRoute.create({
        data: { province: PROVINCE, targetTenantId: TENANT_ID, active: true, updatedBy: ADMIN.userId },
      })
    );
    await signInAdmin(page);
    await page.goto('/en/admin/lead-routes');

    const select = page.getByLabel(`Consultancy for ${PROVINCE}`);
    await expectHydrated(select);
    await expect(page.getByRole('heading', { name: 'Lead routing: province → consultancy' })).toBeVisible();
    await expect(select).toHaveValue(TENANT_ID);
    await expect(provinceRow(page)).toContainText('Active');
    await expect(page.getByRole('columnheader', { name: 'Readiness level' })).toBeVisible();
    await expect(leadRow(page)).toContainText('Developing');
    await page.screenshot({ path: `${SHOTS}/03-en-after-reload.png`, fullPage: true });
  });
});

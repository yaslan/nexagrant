import { test, expect } from '@playwright/test';

import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-135 (M18-F3) — the sidebar entry "Müşteri Satış Hattı" for a PILOT tenant.
 *
 * M18 is an unsold beta: `PILOT` opens it to the tenant's managers (TENANT_OWNER and the
 * other PILOT_ROLES), and a plain MEMBER must not see it in the navigation at all. The entry
 * comes from the same decision the module gate makes (decideModuleAccess), so the two halves
 * here check that the sidebar and the door agree: the owner clicks through to the pipeline,
 * the member gets no entry.
 */
const TENANT = 'ng135-sidebar-tenant';
const WORKSPACE_ID = 'ng135-sidebar-workspace';
const WS = 'ng135-sidebar';
const OWNER = { id: 'ng135-sidebar-owner', email: 'ng135-sidebar-owner@e2e.fabrika.test' };
const MEMBER = { id: 'ng135-sidebar-member', email: 'ng135-sidebar-member@e2e.fabrika.test' };
const SHOTS = shotsDir('NG-135');
const NAV_LABEL = trMessages.modules['client-pipeline'].name;
// The link's accessible name carries its status badge ("Müşteri Satış Hattı PILOT"), so match the start.
const NAV_LINK = new RegExp(`^${NAV_LABEL}`);

test.beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: { id: TENANT, name: 'NG-135 sidebar (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'NG-135 sidebar', slug: WS },
    update: { slug: WS },
  });
  for (const u of [
    { ...OWNER, role: 'TENANT_OWNER' as const, name: 'NG-135 Owner' },
    { ...MEMBER, role: 'MEMBER' as const, name: 'NG-135 Member' },
  ]) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, name: u.name, locale: 'tr' },
      update: { email: u.email },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT, userId: u.id } },
      create: { tenantId: TENANT, userId: u.id, role: u.role, workspaceIds: [WORKSPACE_ID] },
      update: { role: u.role, workspaceIds: [WORKSPACE_ID] },
    });
  }
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
    create: { tenantId: TENANT, moduleId: 'M18', status: 'PILOT', changedBy: 'ng-135 sidebar e2e' },
    update: { status: 'PILOT' },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('owner sees the sidebar entry and it opens the pipeline', async ({ page }) => {
  await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });
  await page.goto(`/tr/${WS}/panel`);

  const entry = page.getByRole('link', { name: NAV_LINK }).first();
  await expect(entry).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/sidebar-owner-before-click.png`, fullPage: false });

  await entry.click();
  await expect(page).toHaveURL(new RegExp(`/tr/${WS}/musteri-hatti`));
  await expect(page.getByRole('heading', { name: NAV_LABEL }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/sidebar-owner-after-click.png`, fullPage: false });
});

test('member does not see the sidebar entry', async ({ page }) => {
  await signInAs(page, { id: MEMBER.id, email: MEMBER.email, tenantId: TENANT, role: 'MEMBER' });
  await page.goto(`/tr/${WS}/panel`);
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await expect(page.getByRole('link', { name: NAV_LINK })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/sidebar-member-no-entry.png`, fullPage: false });
});

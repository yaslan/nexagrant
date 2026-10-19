import { test, expect } from '@playwright/test';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { withSystemScope } from '../../src/lib/system-scope';

const SHOTS = shotsDir('TASK-MUU3KY8EO0H76-members-menu-link');
const TENANT = 'demo-tenant';
const OWNER = { id: 'e2e-members-menu-owner', email: 'members-menu-owner@e2e.fabrika.test', name: 'Menu Owner', role: 'TENANT_OWNER' as const, tenantId: TENANT };
const MEMBER = { id: 'e2e-members-menu-member', email: 'members-menu-member@e2e.fabrika.test', name: 'Menu Member', role: 'MEMBER' as const, tenantId: TENANT };
const WS = { id: 'e2e-members-menu-ws', slug: 'menulink-ws', name: 'Members Menu WS' };

const membersHref = /\/tr\/menulink-ws\/ayarlar\/uyeler$/;

test.describe('Members menu link (manage_users)', () => {
  test.beforeAll(async () => {
    await seedIdentity({ userId: OWNER.id, email: OWNER.email, name: OWNER.name, role: OWNER.role, tenantId: TENANT }, WS);
    await seedIdentity({ userId: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: MEMBER.role, tenantId: TENANT, workspaceIds: [WS.id] });
  });

  test.afterAll(async () => {
    await cleanupIdentity([OWNER.id, MEMBER.id]);
    // Only the workspace this spec created; demo-tenant and its other rows are left alone.
    await withSystemScope('platform-admin', 'e2e.settings-members-menu-link.teardown', async (tx) => {
      await tx.workspace.deleteMany({ where: { id: WS.id, tenantId: TENANT } });
    });
  });

  test('TENANT_OWNER: sidebar "Üyeler" link opens the invite form', async ({ page }) => {
    await signInAs(page, { id: OWNER.id, email: OWNER.email, name: OWNER.name, role: OWNER.role, tenantId: TENANT });
    await page.goto('/tr/menulink-ws/panel');

    const link = page.getByRole('link', { name: 'Üyeler', exact: true }).filter({ visible: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', membersHref);
    await link.click();

    await expect(page).toHaveURL(membersHref);
    await expect(page.getByRole('heading', { name: 'Yeni Üye Davet Et' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Davet Gönder' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-owner-sidebar-to-invite-form.png` });
  });

  test('TENANT_OWNER: user menu "Üyeler" entry opens the invite form', async ({ page }) => {
    await signInAs(page, { id: OWNER.id, email: OWNER.email, name: OWNER.name, role: OWNER.role, tenantId: TENANT });
    await page.goto('/tr/menulink-ws/panel');

    await page.getByRole('button', { name: /Menu Owner/ }).filter({ visible: true }).click();
    const entry = page.getByRole('link', { name: 'Üyeler', exact: true }).filter({ visible: true });
    // sidebar link + user-menu entry
    await expect(entry).toHaveCount(2);
    await page.screenshot({ path: `${SHOTS}/02-owner-user-menu.png` });
    await entry.last().click();

    await expect(page).toHaveURL(membersHref);
    await expect(page.getByRole('button', { name: 'Davet Gönder' })).toBeVisible();
  });

  test('MEMBER: no "Üyeler" link in sidebar or user menu', async ({ page }) => {
    await signInAs(page, { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: MEMBER.role, tenantId: TENANT });
    await page.goto('/tr/menulink-ws/panel');

    await page.getByRole('button', { name: /Menu Member/ }).filter({ visible: true }).click();
    // The menu is open (its e-mail is on screen) before we assert an absence.
    await expect(page.getByText(MEMBER.email).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Üyeler', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/03-member-no-link.png` });
  });

  test('mobile 390px, TENANT_OWNER: the drawer carries the "Üyeler" link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, { id: OWNER.id, email: OWNER.email, name: OWNER.name, role: OWNER.role, tenantId: TENANT });
    await page.goto('/tr/menulink-ws/panel');

    await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    const link = page.getByRole('link', { name: 'Üyeler', exact: true }).filter({ visible: true });
    await expect(link).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/04-mobile-owner-drawer.png` });
    await link.click();

    await expect(page).toHaveURL(membersHref);
    await expect(page.getByRole('button', { name: 'Davet Gönder' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-mobile-owner-invite-form.png` });
  });

  test('mobile 390px, MEMBER: the drawer has no "Üyeler" link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: MEMBER.role, tenantId: TENANT });
    await page.goto('/tr/menulink-ws/panel');

    await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    await expect(page.getByRole('link', { name: 'Ayarlar', exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Üyeler', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/06-mobile-member-drawer.png` });
  });
});

import { test, expect, type Page } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';

/**
 * NG-8 — the notification centre's preference screen (spec §13).
 *
 * Real clicks on /en/<ws>/notifications: change a channel's frequency, reload,
 * the value stays. A second member of the SAME tenant keeps the default, which
 * proves the write is keyed on the session user, not on the tenant.
 */

const RUN = Date.now().toString(36);
const SHOTS = shotsDir('NG-8-notification-preferences');

const OWNER = {
  tenantId: `e2e-ng8-${RUN}`,
  userId: `e2e-ng8-owner-${RUN}`,
  email: `ng8-owner-${RUN}@e2e-ng8.test`,
  ws: { id: `e2e-ng8-ws-${RUN}`, slug: `ng8-${RUN}`, name: 'NG-8 Owner' },
};
const MEMBER = {
  tenantId: OWNER.tenantId,
  userId: `e2e-ng8-member-${RUN}`,
  email: `ng8-member-${RUN}@e2e-ng8.test`,
  ws: OWNER.ws,
};

function token(u: typeof OWNER, role: 'TENANT_OWNER' | 'MEMBER') {
  return { id: u.userId, email: u.email, tenantId: u.tenantId, role };
}

async function signIn(page: Page, u: typeof OWNER, role: 'TENANT_OWNER' | 'MEMBER') {
  await signInAs(page, token(u, role));
}

/** The e-mail select of the "New matching call" row. */
function emailSelect(page: Page) {
  return page.getByRole('combobox', { name: 'New matching call — E-mail' });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await withSystemScope('platform-admin', 'e2e.ng8.seed', async (tx) => {
    await tx.tenant.create({
      data: { id: OWNER.tenantId, name: `NG-8 E2E ${OWNER.tenantId}`, slug: OWNER.tenantId, country: 'TR', orgType: 'SME' },
    });
  });
  await seedIdentity({ userId: OWNER.userId, email: OWNER.email, role: 'TENANT_OWNER', tenantId: OWNER.tenantId }, OWNER.ws);
  await seedIdentity({ userId: MEMBER.userId, email: MEMBER.email, role: 'MEMBER', tenantId: MEMBER.tenantId }, MEMBER.ws);
});

test.afterAll(async () => {
  await cleanupIdentity([OWNER.userId, MEMBER.userId]);
  await withSystemScope('platform-admin', 'e2e.ng8.cleanup', async (tx) => {
    const tenantId = requireId(OWNER.tenantId, 'tenantId');
    await tx.notificationPreference.deleteMany({ where: { tenantId } });
    await tx.workspace.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
});

test.describe('Notification preferences — NG-8', () => {
  test('owner changes e-mail frequency, the value survives a reload', async ({ page }) => {
    await signIn(page, OWNER, 'TENANT_OWNER');
    await page.goto(`/en/${OWNER.ws.slug}/notifications`);

    await expect(page.getByRole('heading', { level: 2, name: 'Notification preferences' })).toBeVisible();
    await expect(emailSelect(page)).toHaveValue('OFF');
    await page.screenshot({ path: `${SHOTS}/before.png`, fullPage: true });

    await emailSelect(page).selectOption('WEEKLY');
    await expect(page.getByRole('status')).toHaveText('Preference saved');

    await page.reload();
    await expect(emailSelect(page)).toHaveValue('WEEKLY');
    await page.screenshot({ path: `${SHOTS}/after-reload.png`, fullPage: true });
  });

  test('the row is stored for the owner only: a same-tenant member keeps the default', async ({ page }) => {
    await signIn(page, MEMBER, 'MEMBER');
    await page.goto(`/en/${MEMBER.ws.slug}/notifications`);

    await expect(emailSelect(page)).toHaveValue('OFF');
  });

  test('the owner is still WEEKLY after the member looked at the page', async ({ page }) => {
    await signIn(page, OWNER, 'TENANT_OWNER');
    await page.goto(`/en/${OWNER.ws.slug}/notifications`);
    await expect(emailSelect(page)).toHaveValue('WEEKLY');
  });

  test('the TR page shows the Turkish preference labels', async ({ page }) => {
    await signIn(page, OWNER, 'TENANT_OWNER');
    await page.goto(`/tr/${OWNER.ws.slug}/bildirimler`);
    await expect(page.getByRole('heading', { level: 2, name: 'Bildirim tercihleri' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Yeni eşleşen çağrı — E-posta' })).toHaveValue('WEEKLY');
  });
});

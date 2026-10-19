import { test, expect, type Page } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MUVR2C9H3KTHQ — the bell and /notifications read the notification store,
 * and `searchName` (user input, stored unescaped — se-fb, PR #51 review) is
 * rendered as text.
 *
 * One SAVED_SEARCH_MATCH row carries `<img src=x onerror=alert(1)>` as its
 * name. It must show up literally in the bell and on the page (EN and TR), no
 * <img> may be created from it, and no dialog may open. Clicking the row marks
 * it read on the server (readAt), which the badge and a reload reflect.
 *
 * Own tenant only, created here and deleted in afterAll (the tenant cascade
 * removes the Notification row). demo-tenant is never touched.
 */

const RUN = Date.now().toString(36);
const SHOTS = shotsDir('TASK-MUVR2C9H3KTHQ-evidence');
const XSS = '<img src=x onerror=alert(1)>';

const U = {
  tenantId: `e2e-notif-xss-${RUN}`,
  userId: `e2e-notif-xss-user-${RUN}`,
  email: `notif-xss-${RUN}@e2e-notif.test`,
  ws: { id: `e2e-notif-xss-ws-${RUN}`, slug: `notif-xss-${RUN}`, name: 'Notif XSS' },
};
const NOTIF_ID = `e2e-notif-xss-n1-${RUN}`;

const EN_DESC = `2 calls matched "${XSS}"`;
const TR_DESC = `2 çağrı "${XSS}" ile eşleşti`;

function watchDialogs(page: Page): { count: () => number } {
  let n = 0;
  page.on('dialog', async (d) => {
    n += 1;
    await d.dismiss();
  });
  return { count: () => n };
}

/** No element was built from the payload: the only img[src="x"] would be the injected one. */
async function expectNoInjectedImg(page: Page) {
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll('img[onerror]').length)).toBe(0);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await withSystemScope('platform-admin', 'e2e.notif-xss.seed', async (tx) => {
    await tx.tenant.create({
      data: { id: U.tenantId, name: `Notif XSS ${U.tenantId}`, slug: U.tenantId, country: 'TR', orgType: 'SME' },
    });
  });
  await seedIdentity({ userId: U.userId, email: U.email, role: 'TENANT_OWNER', tenantId: U.tenantId }, U.ws);
  await withSystemScope('platform-admin', 'e2e.notif-xss.seed', async (tx) => {
    await tx.notification.create({
      data: {
        id: NOTIF_ID,
        tenantId: U.tenantId,
        userId: U.userId,
        type: 'SAVED_SEARCH_MATCH',
        payload: { searchId: `s-${RUN}`, searchName: XSS, matchCount: 2, since: new Date().toISOString() },
      },
    });
  });
});

test.afterAll(async () => {
  await cleanupIdentity([U.userId]);
  await withSystemScope('platform-admin', 'e2e.notif-xss.cleanup', async (tx) => {
    const tenantId = requireId(U.tenantId, 'tenantId');
    await tx.notification.deleteMany({ where: { tenantId } });
    await tx.workspace.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
});

test('bell (EN): unread dot, searchName shown as text, no <img>, no dialog', async ({ page }) => {
  const dialogs = watchDialogs(page);
  await signInAs(page, { id: U.userId, email: U.email, tenantId: U.tenantId, role: 'TENANT_OWNER' });
  await page.goto(`/en/${U.ws.slug}/dashboard`);

  const bell = page.getByRole('button', { name: 'Notifications' });
  await expect(bell.locator('span')).toHaveCount(1);
  await bell.click();

  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByText(EN_DESC, { exact: true })).toBeVisible();
  await expect(panel.getByText('New match found')).toBeVisible();
  await expect(panel.getByText('1 Unread')).toBeVisible();
  await expectNoInjectedImg(page);
  await page.screenshot({ path: `${SHOTS}/bell-en-xss-text.png` });
  expect(dialogs.count(), 'no alert() from the payload').toBe(0);
});

test('page (EN + TR): searchName shown as text, no <img>, no dialog', async ({ page }) => {
  const dialogs = watchDialogs(page);
  await signInAs(page, { id: U.userId, email: U.email, tenantId: U.tenantId, role: 'TENANT_OWNER' });

  await page.goto(`/en/${U.ws.slug}/notifications`);
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expect(page.getByText(EN_DESC, { exact: true })).toBeVisible();
  await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();
  await expectNoInjectedImg(page);
  await page.screenshot({ path: `${SHOTS}/page-en-xss-text.png`, fullPage: true });

  await page.goto(`/tr/${U.ws.slug}/bildirimler`);
  await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();
  await expect(page.getByText(TR_DESC, { exact: true })).toBeVisible();
  await expectNoInjectedImg(page);
  await page.screenshot({ path: `${SHOTS}/page-tr-xss-text.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/${U.ws.slug}/notifications`);
  await expect(page.getByText(EN_DESC, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Notifications' }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByText(EN_DESC, { exact: true })).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${SHOTS}/390-bell-xss-text.png` });

  expect(dialogs.count(), 'no alert() from the payload').toBe(0);
});

test('click marks it read on the server: badge clears and stays cleared after reload', async ({ page }) => {
  await signInAs(page, { id: U.userId, email: U.email, tenantId: U.tenantId, role: 'TENANT_OWNER' });
  await page.goto(`/en/${U.ws.slug}/notifications`);
  await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: new RegExp('New match found') }).click();
  await expect(page.getByText('All Notifications Read')).toBeVisible();

  await page.reload();
  await expect(page.getByText('All Notifications Read')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(0);

  const row = await withSystemScope('platform-admin', 'e2e.notif-xss.check', (tx) =>
    tx.notification.findUnique({ where: { id: NOTIF_ID }, select: { readAt: true } }),
  );
  expect(row?.readAt, 'readAt written by markNotificationsRead').not.toBeNull();

  // ADR-0011 §3.3: legacy overlay keys (guest + per-user) are removed by the shell on load.
  await page.evaluate((email) => {
    localStorage.setItem('fonbridge_read_notifs_guest', '["x"]');
    localStorage.setItem(`fonbridge_read_notifs_${email}`, '["y"]');
    localStorage.setItem('unrelated_key', 'kept');
  }, U.email);
  await page.reload();
  await expect(page.getByText('All Notifications Read')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fonbridge_read_notifs_'))))
    .toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('unrelated_key'))).toBe('kept');
});

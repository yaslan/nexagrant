import { test, expect, type Page } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MUU7678DFI9QF — notification center (bell in the app shell + the
 * /notifications · /bildirimler page).
 *
 * What exists today, and so what this spec can honestly drive:
 *
 * There is NO notification store. `prisma/schema.prisma` has no notification
 * model, `notifications/page.tsx` passes `initialNotifications={[]}` and the
 * bell in `UserMenu.tsx` memoises `[]` (both removed fabricated items in
 * TASK-MTQYXISOPUJ53). No seed and no user action can make a notification
 * appear without either changing product code or inventing rows — both ruled
 * out for this card. So the live part covers the real surface: the empty feed
 * on both locales, the bell and its dropdown, navigation, keyboard, 390px,
 * workspace isolation, and a guard that the invented items never come back.
 *
 * The read/unread flows (badge count, click → read, mark all, reload
 * persistence, cross-tab) are kept below as `test.fixme`, BLOCKED on the
 * store. Their logic is covered meanwhile by the unit test
 * `tests/notifications-read-store.test.tsx`.
 *
 * Read state key: `notificationStorageKey(email)` →
 * `fonbridge_read_notifs_<email>` — per USER (e-mail), not per workspace.
 * `fonbridge_read_notifs_guest` is the signed-out key, and the hook merges it
 * into every signed-in user's overlay on the same browser.
 *
 * Own rows only: two tenants created here and deleted in afterAll.
 * demo-tenant is never touched.
 */

const RUN = Date.now().toString(36);
const SHOTS = shotsDir('TASK-MUU7678DFI9QF-notifications');

const A = {
  tenantId: `e2e-notif-a-${RUN}`,
  userId: `e2e-notif-a-user-${RUN}`,
  email: `notif-a-${RUN}@e2e-notif.test`,
  ws: { id: `e2e-notif-a-ws-${RUN}`, slug: `notif-a-${RUN}`, name: 'Notif A' },
};
const B = {
  tenantId: `e2e-notif-b-${RUN}`,
  userId: `e2e-notif-b-user-${RUN}`,
  email: `notif-b-${RUN}@e2e-notif.test`,
  ws: { id: `e2e-notif-b-ws-${RUN}`, slug: `notif-b-${RUN}`, name: 'Notif B' },
};

// The four/three items TASK-MTQYXISOPUJ53 removed from the page and the bell.
const FABRICATED = /HORIZON-CL5-2026-D3|Fraunhofer|500 AI|%92|15 days|15 gün/;

function token(u: typeof A) {
  return { id: u.userId, email: u.email, tenantId: u.tenantId, role: 'TENANT_OWNER' };
}

async function signIn(page: Page, u: typeof A) {
  await signInAs(page, token(u));
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await withSystemScope('platform-admin', 'e2e.notif.seed', async (tx) => {
    for (const u of [A, B]) {
      await tx.tenant.create({
        data: { id: u.tenantId, name: `Notif E2E ${u.tenantId}`, slug: u.tenantId, country: 'TR', orgType: 'SME' },
      });
    }
  });
  for (const u of [A, B]) {
    await seedIdentity(
      { userId: u.userId, email: u.email, role: 'TENANT_OWNER', tenantId: u.tenantId },
      u.ws,
    );
  }
});

test.afterAll(async () => {
  await cleanupIdentity([A.userId, B.userId]);
  await withSystemScope('platform-admin', 'e2e.notif.cleanup', async (tx) => {
    for (const u of [A, B]) {
      const tenantId = requireId(u.tenantId, 'tenantId');
      await tx.workspace.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    }
  });
});

test.describe('Notification center — live surface', () => {
  test('EN page: honest empty feed, no unread badge, no fabricated items', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);

    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('You have no notifications yet.').first()).toBeVisible();
    await expect(page.getByText('All Notifications Read')).toBeVisible();
    await expect(page.getByText(/\d+ Unread Notifications/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark All as Read' })).toHaveCount(0);
    await expect(page.locator('main, body').first()).not.toContainText(FABRICATED);

    // The back arrow leads to this workspace's dashboard, not another one.
    await expect(page.locator(`a[href="/en/${A.ws.slug}/dashboard"]`).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-empty-feed.png`, fullPage: true });
  });

  test('TR page: /tr/<ws>/bildirimler renders the Turkish empty feed', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/tr/${A.ws.slug}/bildirimler`);

    await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();
    await expect(page.getByText('Henüz bildiriminiz yok.').first()).toBeVisible();
    await expect(page.getByText('Tüm Bildirimler Okundu')).toBeVisible();
    await expect(page.getByText(/\d+ Okunmamış Bildirim/)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(FABRICATED);
    await page.screenshot({ path: `${SHOTS}/tr-empty-feed.png`, fullPage: true });
  });

  test('bell: no unread dot, dropdown shows the empty state, link navigates to the page', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell).toBeVisible();
    // The unread dot is the only span inside the bell button.
    await expect(bell.locator('span')).toHaveCount(0);

    await bell.click();
    const viewAll = page.getByRole('link', { name: 'View all notifications' });
    await expect(viewAll).toBeVisible();
    await expect(page.getByText('All Read', { exact: true })).toBeVisible();
    await expect(page.getByText('You have no notifications yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(FABRICATED);
    await expect(viewAll).toHaveAttribute('href', `/en/${A.ws.slug}/notifications`);
    await page.screenshot({ path: `${SHOTS}/en-bell-open.png` });

    await viewAll.click();
    await expect(page).toHaveURL(new RegExp(`/en/${A.ws.slug}/notifications$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  });

  test('bell on TR routes links to /bildirimler', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/tr/${A.ws.slug}/panel`);

    await page.getByRole('button', { name: 'Bildirimler' }).click();
    const viewAll = page.getByRole('link', { name: 'Tüm bildirimleri gör' });
    await expect(viewAll).toHaveAttribute('href', `/tr/${A.ws.slug}/bildirimler`);
    await viewAll.click();
    await expect(page).toHaveURL(new RegExp(`/tr/${A.ws.slug}/bildirimler$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();
  });

  test('keyboard: Tab reaches the bell, Enter opens it, Enter on the link navigates', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell).toBeVisible();
    // Real Tab traversal from the top of the document, not .focus().
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await bell.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'bell button reachable with Tab').toBe(true);

    await page.keyboard.press('Enter');
    const viewAll = page.getByRole('link', { name: 'View all notifications' });
    await expect(viewAll).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(viewAll).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/en/${A.ws.slug}/notifications$`));
  });

  test('390px: page fits without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);

    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('All Notifications Read')).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SHOTS}/390-page.png`, fullPage: true });
  });

  // B1 (TASK-MUU7678DFI9QF report): the panel used to start at x≈-26 at 390px.
  // Fixed in TASK-MUUS56953SPMX; the strict assertion now has to pass.
  test('390px: bell dropdown stays inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await bell.click();
    const viewAll = page.getByRole('link', { name: 'View all notifications' });
    await expect(viewAll).toBeVisible();
    const panel = page.locator('div.absolute').filter({ has: viewAll });
    await page.screenshot({ path: `${SHOTS}/390-bell-open.png` });
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  // N2 (TASK-MUU7678DFI9QF report): the bell exposes its state to assistive tech,
  // Escape closes the panel and focus goes back to the bell.
  test('a11y: bell announces its popup state, Escape closes it and returns focus', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell).toHaveAttribute('aria-label', 'Notifications');
    await expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(bell).toHaveAttribute('aria-expanded', 'false');

    await bell.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    await expect(bell).toHaveAttribute('aria-controls', (await panel.getAttribute('id'))!);

    // Escape from inside the panel, not only from the button.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'View all notifications' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(bell).toHaveAttribute('aria-expanded', 'false');
    await expect(bell).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/en/${A.ws.slug}/dashboard$`));
  });

  test('a11y: TR bell carries the Turkish name and also closes on Escape', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/tr/${A.ws.slug}/panel`);

    const bell = page.getByRole('button', { name: 'Bildirimler' });
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toBeVisible();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toHaveCount(0);
    await expect(bell).toBeFocused();
  });

  // The URL slug is NOT an access boundary anywhere in the app (no guard compares
  // it with the session's workspaces — report finding B2): B on A's URL gets a 200
  // shell. What must hold is that everything shown is B's: data is scoped by the
  // session tenant, not by the slug.
  test("isolation: on A's URL, user B gets a 404 and nothing of A; B's own URL shows B's session", async ({ page }) => {
    await signIn(page, B);

    // FIX-4 (TASK-MUUS62C4SC7H5): [workspace]/layout answers 404 to a slug that
    // is not the session's — A's workspace is not rendered for B at all.
    for (const [path, title] of [
      [`/en/${A.ws.slug}/notifications`, 'Page Not Found'],
      [`/tr/${A.ws.slug}/bildirimler`, 'Sayfa Bulunamadı'],
    ] as const) {
      const res = await page.goto(path);
      expect(res, `no response for ${path}`).not.toBeNull();
      expect(res!.status(), `${path} must answer 404 to B`).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      if (path.startsWith('/en/')) {
        await page.screenshot({ path: `${SHOTS}/isolation-b-on-a-url.png`, fullPage: true });
      }

      // Nothing of A in the DOM: no feed, no workspace, no identity, no links in.
      await expect(page.getByText(`notif-a-${RUN}`)).toHaveCount(0);
      await expect(page.getByText(A.email)).toHaveCount(0);
      await expect(page.getByText(A.ws.name, { exact: true })).toHaveCount(0);
      await expect(page.locator(`a[href*="/${A.ws.slug}"]`)).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: /^(Notifications|Bildirimler)$/ })).toHaveCount(0);
      await expect(page.getByText(/You have no notifications yet\.|Henüz bildiriminiz yok\./)).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(FABRICATED);

      // The 404 did not cost B the session, nor swap it for A's.
      const session = await page.evaluate(async () => (await fetch('/api/auth/session')).json());
      expect(session.user?.id ?? session.user?.sub ?? session.userId).toBe(B.userId);
    }

    // On B's own URL: B's shell, B's feed, links back into B's workspace — and still nothing of A.
    const own = await page.goto(`/en/${B.ws.slug}/notifications`);
    expect(own?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`notif-b-${RUN}`) })).toBeVisible();
    await expect(page.getByText('You have no notifications yet.').first()).toBeVisible();
    await expect(page.locator(`a[href="/en/${B.ws.slug}/dashboard"]`).first()).toBeVisible();
    await expect(page.getByText(`notif-a-${RUN}`)).toHaveCount(0);
    await expect(page.getByText(A.email)).toHaveCount(0);
    await expect(page.locator(`a[href*="/${A.ws.slug}"]`)).toHaveCount(0);
  });
});

test.describe('Notification center — read/unread flows (TASK-MUVIK218O313G)', () => {
  let n1: string;
  let n2: string;

  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.notif.seed-rw-flows', async (tx) => {
      const res1 = await tx.notification.create({
        data: {
          id: `n1-${RUN}`,
          tenantId: A.tenantId,
          userId: A.userId,
          type: 'SAVED_SEARCH_MATCH',
          payload: { searchId: 'n1-search', searchName: 'n1-title', matchCount: 1, since: new Date().toISOString() },
          workspaceId: A.ws.id,
        },
      });
      n1 = res1.id;
      const res2 = await tx.notification.create({
        data: {
          id: `n2-${RUN}`,
          tenantId: A.tenantId,
          userId: A.userId,
          type: 'SAVED_SEARCH_MATCH',
          payload: { searchId: 'n2-search', searchName: 'n2-title', matchCount: 1, since: new Date().toISOString() },
          workspaceId: A.ws.id,
        },
      });
      n2 = res2.id;
    });
  });

  test.afterAll(async () => {
    await cleanupIdentity([A.userId]);
    await withSystemScope('platform-admin', 'e2e.notif.cleanup-rw-flows', async (tx) => {
      const tenantId = requireId(A.tenantId, 'tenantId');
      await tx.notification.deleteMany({ where: { id: { in: [n1, n2] } } });
      await tx.workspace.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });
  });

  test('badge shows 2 unread; clicking one marks it read, count drops to 1', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications')).toBeVisible();

    const items = page.getByRole('button', { name: /n[12]-title/ });
    await items.nth(0).click();

    await expect(page.getByText('1 Unread Notifications')).toBeVisible();
  });

  test('mark all as read from the header button', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications')).toBeVisible();

    await page.getByRole('button', { name: 'Mark All as Read' }).click();
    await expect(page.getByText('All Notifications Read')).toBeVisible();
  });

  test('read state survives a reload', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications')).toBeVisible();

    await page.getByRole('button', { name: /n[12]-title/ }).click();
    await expect(page.getByText('1 Unread Notifications')).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 Unread Notifications')).toBeVisible();
  });

  test('bell: unread dot appears, click → read, dot clears', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell.locator('span')).toHaveCount(1);

    await bell.click();
    const items = page.getByRole('button', { name: /n[12]-title/ });
    await items.nth(0).click();

    await bell.click();
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(bell.locator('span')).toHaveCount(0);
  });

  test('cross-tab update: focus refetches and shows other tab marked read', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    try {
      await signInAs(page1, token(A));
      await page1.goto(`/en/${A.ws.slug}/notifications`);
      await expect(page1.getByText('2 Unread Notifications')).toBeVisible();

      await signInAs(page2, token(A));
      await page2.goto(`/en/${A.ws.slug}/notifications`);
      await expect(page2.getByText('2 Unread Notifications')).toBeVisible();
      await page2.getByRole('button', { name: 'Mark All as Read' }).click();
      await expect(page2.getByText('All Notifications Read')).toBeVisible();

      await page1.bringToFront();
      await expect(page1.getByText('All Notifications Read')).toBeVisible({ timeout: 5000 });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("B's notifications do not affect A's read state", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      await signInAs(pageA, token(A));
      await pageA.goto(`/en/${A.ws.slug}/notifications`);
      await expect(pageA.getByText('2 Unread Notifications')).toBeVisible();

      // B's read state isolated from A
      const keyB = `fonbridge_read_notifs_${B.email}`;
      await pageA.evaluate((k) => localStorage.setItem(k, JSON.stringify(['b1', 'b2'])), keyB);

      await pageA.reload();
      await expect(pageA.getByText('2 Unread Notifications')).toBeVisible();
    } finally {
      await contextA.close();
    }
  });
});

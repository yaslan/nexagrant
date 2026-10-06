import { test, expect, type Page } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';
import { withTenant } from '@/lib/db';
import { sendSavedSearchAlerts } from '@/lib/jobs/tasks/alerts-daily';
import { savedSearchDedupeKey } from '@/lib/notifications/store';

/**
 * TASK-MUU7678DFI9QF — notification center (bell in the app shell + the
 * /notifications · /bildirimler page).
 *
 * The "live surface" block covers a user with no notifications: the empty
 * feed on both locales, the bell and its dropdown, navigation, keyboard,
 * 390px, workspace isolation, and a guard that the invented items of
 * TASK-MTQYXISOPUJ53 never come back.
 *
 * Since the notification store (ADR-0011, PR #51/#53) the read/unread flows
 * run against real rows and `readAt` (TASK-MUVR2HXPCYRGT), and a producer
 * test drives the alerts-daily loop into the bell.
 *
 * Own rows only: two tenants created here and deleted in afterAll; M is a
 * second member of A's tenant.
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

const M = {
  userId: `e2e-notif-m-user-${RUN}`,
  email: `notif-m-${RUN}@e2e-notif.test`,
};

// The four/three items TASK-MTQYXISOPUJ53 removed from the page and the bell.
const FABRICATED = /HORIZON-CL5-2026-D3|Fraunhofer|500 AI|%92|15 days|15 gün/;

function token(u: typeof A | typeof M) {
  return u === M
    ? { id: M.userId, email: M.email, tenantId: A.tenantId, role: 'PIPELINE_MANAGER' }
    : { id: u.userId, email: u.email, tenantId: (u as typeof A).tenantId, role: 'TENANT_OWNER' };
}

async function signIn(page: Page, u: typeof A | typeof M) {
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
  await seedIdentity({
    userId: M.userId, email: M.email, role: 'PIPELINE_MANAGER', tenantId: A.tenantId, workspaceIds: [A.ws.id],
  });
});

test.afterAll(async () => {
  await withSystemScope('platform-admin', 'e2e.notif.cleanup', async (tx) => {
    for (const u of [A, B]) {
      const tenantId = requireId(u.tenantId, 'tenantId');
      await tx.notification.deleteMany({ where: { tenantId } });
      await tx.savedSearch.deleteMany({ where: { tenantId } });
    }
  });
  await cleanupIdentity([A.userId, B.userId, M.userId]);
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

/*
 * The six read/unread flows that were `test.fixme` until the store landed
 * (BLOCKED on TASK-MUVIK218O313G), now against real rows. A gets two
 * SAVED_SEARCH_MATCH rows, n1 (older) and n2; beforeEach puts both back to
 * unread, so each test starts from "2 unread" whatever the one before did.
 * Every flow also checks `readAt` in the database: the badge alone could be
 * a client-side overlay again (the localStorage store ADR-0011 removed).
 *
 * M is a second member of A's tenant. Same tenant on purpose: RLS already
 * keeps other tenants out, so the boundary under test is the store's
 * `userId` filter (ADR-0011 K-5 a).
 */
test.describe('Notification center — read/unread flows', () => {
  const N1 = `e2e-notif-n1-${RUN}`;
  const N2 = `e2e-notif-n2-${RUN}`;
  const MN = `e2e-notif-m1-${RUN}`;
  const n1Row = (page: Page) => page.getByRole('button', { name: /matched "n1-title"/ });
  const n2Row = (page: Page) => page.getByRole('button', { name: /matched "n2-title"/ });

  async function readAtOf(ids: string[]) {
    const rows = await withSystemScope('platform-admin', 'e2e.notif.check', (tx) =>
      tx.notification.findMany({ where: { id: { in: ids } }, select: { id: true, readAt: true } }),
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.readAt !== null]));
  }

  test.beforeAll(async () => {
    const older = new Date(Date.now() - 60_000);
    await withSystemScope('platform-admin', 'e2e.notif.seed-rw', async (tx) => {
      await tx.notification.createMany({
        data: [
          { id: N1, tenantId: A.tenantId, userId: A.userId, type: 'SAVED_SEARCH_MATCH', createdAt: older,
            payload: { searchId: `n1-${RUN}`, searchName: 'n1-title', matchCount: 1, since: older.toISOString() } },
          { id: N2, tenantId: A.tenantId, userId: A.userId, type: 'SAVED_SEARCH_MATCH',
            payload: { searchId: `n2-${RUN}`, searchName: 'n2-title', matchCount: 2, since: older.toISOString() } },
          { id: MN, tenantId: A.tenantId, userId: M.userId, type: 'SAVED_SEARCH_MATCH',
            payload: { searchId: `m1-${RUN}`, searchName: 'm1-title', matchCount: 3, since: older.toISOString() } },
        ],
      });
    });
  });

  test.beforeEach(async () => {
    await withSystemScope('platform-admin', 'e2e.notif.reset-rw', (tx) =>
      tx.notification.updateMany({ where: { id: { in: [N1, N2, MN] } }, data: { readAt: null } }),
    );
  });

  // The live-surface tests above expect an empty feed for A; on --repeat-each
  // they run again, so A's rows go here, not only with the tenant.
  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.notif.cleanup-rw', (tx) =>
      tx.notification.deleteMany({ where: { id: { in: [N1, N2, MN] } } }),
    );
  });

  test('badge shows 2 unread; clicking one marks it read, count drops to 1', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
    // Newest first.
    await expect(page.getByRole('button', { name: /matched "n[12]-title"/ }).first()).toContainText('n2-title');

    await n1Row(page).click();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();
    expect(await readAtOf([N1, N2])).toEqual({ [N1]: true, [N2]: false });
  });

  test('mark all as read from the header button', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Mark All as Read' }).click();
    await expect(page.getByText('All Notifications Read')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark All as Read' })).toHaveCount(0);
    expect(await readAtOf([N1, N2])).toEqual({ [N1]: true, [N2]: true });
  });

  test('read state survives a reload', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    await n1Row(page).click();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();
    // The unread dot is the only span in a row's title line: n1 lost it, n2 kept it.
    await expect(n1Row(page).locator('h3 + span')).toHaveCount(0);
    await expect(n2Row(page).locator('h3 + span')).toHaveCount(1);

    // Also in a fresh browser context: nothing of it lives in the browser.
    const other = await page.context().browser()!.newContext();
    try {
      const p2 = await other.newPage();
      await signIn(p2, A);
      await p2.goto(`/en/${A.ws.slug}/notifications`);
      await expect(p2.getByText('1 Unread Notification', { exact: true })).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test('bell: unread dot, click item → read, mark all → dot clears', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell.locator('span')).toHaveCount(1);

    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('2 Unread', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /matched "n1-title"/ }).click();
    await expect(panel.getByText('1 Unread', { exact: true })).toBeVisible();
    await expect(bell.locator('span')).toHaveCount(1);
    expect(await readAtOf([N1, N2])).toEqual({ [N1]: true, [N2]: false });

    await panel.getByRole('button', { name: 'Mark All Read' }).click();
    await expect(panel.getByText('All Read', { exact: true })).toBeVisible();
    await expect(bell.locator('span')).toHaveCount(0);
    expect(await readAtOf([N1, N2])).toEqual({ [N1]: true, [N2]: true });

    await page.reload();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(0);
  });

  // ADR-0011 §3.3: the `storage` event went with the localStorage overlay; a
  // tab re-reads the store when it regains focus. Two tabs of one session.
  test('another tab marking read updates this tab when it regains focus', async ({ context }) => {
    const tab1 = await context.newPage();
    await signIn(tab1, A);
    await tab1.goto(`/en/${A.ws.slug}/notifications`);
    await expect(tab1.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
    await expect(tab1.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(1);

    const tab2 = await context.newPage();
    await tab2.goto(`/en/${A.ws.slug}/notifications`);
    await tab2.getByRole('button', { name: 'Mark All as Read' }).click();
    await expect(tab2.getByText('All Notifications Read')).toBeVisible();

    // Without focus nothing refetches: tab1 still shows the old count.
    await expect(tab1.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    // Headless Chromium does not move window focus on bringToFront, so the
    // focus event the product listens for is dispatched as the browser would.
    await tab1.bringToFront();
    await tab1.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(tab1.getByText('All Notifications Read')).toBeVisible();
    await expect(tab1.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(0);
  });

  test("another member's reads do not touch A's notifications", async ({ browser }) => {
    const ctxM = await browser.newContext();
    const ctxA = await browser.newContext();
    try {
      const pm = await ctxM.newPage();
      await signIn(pm, M);
      await pm.goto(`/en/${A.ws.slug}/notifications`);
      // M sees only M's own row, not A's two.
      await expect(pm.getByText('1 Unread Notification', { exact: true })).toBeVisible();
      await expect(pm.getByText(/n[12]-title/)).toHaveCount(0);
      await pm.getByRole('button', { name: 'Mark All as Read' }).click();
      await expect(pm.getByText('All Notifications Read')).toBeVisible();
      expect(await readAtOf([N1, N2, MN])).toEqual({ [N1]: false, [N2]: false, [MN]: true });

      const pa = await ctxA.newPage();
      await signIn(pa, A);
      await pa.goto(`/en/${A.ws.slug}/notifications`);
      await expect(pa.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
      await expect(pa.getByText(/m1-title/)).toHaveCount(0);
    } finally {
      await ctxM.close();
      await ctxA.close();
    }
  });
});

/*
 * Producer (ADR-0011 K-6 a): the alerts-daily loop writes the notification for
 * the saved search's OWNER. M (a member) owns the search; A is the tenant
 * owner and must get nothing. No SMTP (mailer null): the in-app row is written
 * anyway. Then M's bell shows it.
 */
test.describe('Notification center — producer: saved-search alert reaches the owner', () => {
  const NAME = `e2e-producer-${RUN}`;

  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.notif.cleanup-producer', async (tx) => {
      const tenantId = requireId(A.tenantId, 'tenantId');
      await tx.notification.deleteMany({ where: { tenantId, type: 'SAVED_SEARCH_MATCH', userId: requireId(M.userId, 'M.userId') } });
      await tx.savedSearch.deleteMany({ where: { tenantId, name: NAME } });
    });
  });

  test("sendSavedSearchAlerts → SavedSearch.userId's bell, not the tenant owner's", async ({ page }) => {
    const LONG_AGO = new Date('2000-01-01T00:00:00.000Z');
    const search = await withSystemScope('platform-admin', 'e2e.notif.seed-producer', (tx) =>
      tx.savedSearch.create({
        data: { tenantId: A.tenantId, userId: M.userId, name: NAME, filters: {}, notify: true, lastRunAt: LONG_AGO },
      }),
    );
    const result = await sendSavedSearchAlerts(
      [{ id: search.id, tenantId: A.tenantId, userId: M.userId, name: NAME, filters: {}, lastRunAt: LONG_AGO, createdAt: search.createdAt }],
      withTenant,
      null,
    );
    expect(result.errors).toEqual([{ searchId: search.id, reason: 'no_mail_provider' }]);

    const written = await withSystemScope('platform-admin', 'e2e.notif.check-producer', (tx) =>
      tx.notification.findMany({
        where: { tenantId: A.tenantId, dedupeKey: savedSearchDedupeKey(search.id, LONG_AGO) },
        select: { userId: true, type: true, payload: true },
      }),
    );
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ userId: M.userId, type: 'SAVED_SEARCH_MATCH' });
    const matchCount = (written[0]!.payload as { matchCount: number }).matchCount;
    expect(matchCount).toBeGreaterThan(0);

    // M's bell: dot and the alert's text.
    await signIn(page, M);
    await page.goto(`/en/${A.ws.slug}/dashboard`);
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell.locator('span')).toHaveCount(1);
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText(new RegExp(`matched "${NAME}"`))).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/producer-bell-owner.png` });

    // A (tenant owner, same workspace) gets nothing.
    const ctxA = await page.context().browser()!.newContext();
    try {
      const pa = await ctxA.newPage();
      await signIn(pa, A);
      await pa.goto(`/en/${A.ws.slug}/notifications`);
      await expect(pa.getByText('All Notifications Read')).toBeVisible();
      await expect(pa.getByText(NAME)).toHaveCount(0);
    } finally {
      await ctxA.close();
    }
  });
});

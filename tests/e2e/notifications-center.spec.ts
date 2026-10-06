import { test, expect, type Locator, type Page } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { withTenant } from '@/lib/db';
import { recordNotification } from '@/lib/notifications/store';
import { sendSavedSearchAlerts } from '@/lib/jobs/tasks/alerts-daily';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MUU7678DFI9QF — notification center (bell in the app shell + the
 * /notifications · /bildirimler page).
 *
 * Two parts. The live surface with no rows: the empty feed on both locales,
 * the bell and its dropdown, navigation, keyboard, 390px, workspace isolation,
 * and a guard that the items TASK-MTQYXISOPUJ53 removed never come back.
 * Then the read/unread flows on rows written through the notification store
 * (ADR-0011; TASK-MUVR2HXPCYRGT unblocked them): `readAt` on the server is the
 * only read state, so they assert the UI and the row, not localStorage.
 *
 * Own rows only: tenants created here and deleted in afterAll.
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

/*
 * TASK-MUVR2HXPCYRGT — the read/unread flows, unblocked by the notification
 * store (ADR-0011, PR #51) and the store-backed bell/page (PR #53).
 *
 * `readAt` on the server is the only read state: these tests check the UI and
 * the row, never localStorage. Rows are written through the store
 * (`recordNotification` under `withTenant`), the same call alerts-daily makes.
 * Each test starts from A's two unread SAVED_SEARCH_MATCH rows (n1, n2), and
 * the rows are removed afterwards so the live-surface tests above still see an
 * empty feed on the next `--repeat-each` round.
 */
const itemName = (u: typeof A, n: 'n1' | 'n2') => `${n}-${u === A ? 'a' : 'b'}-${RUN}`;

async function clearNotifications(u: typeof A) {
  const tenantId = requireId(u.tenantId, 'tenantId');
  const userId = requireId(u.userId, 'userId');
  await withSystemScope('platform-admin', 'e2e.notif.reset', (tx) =>
    tx.notification.deleteMany({ where: { tenantId, userId } }),
  );
}

async function seedTwoUnread(u: typeof A) {
  await clearNotifications(u);
  for (const n of ['n1', 'n2'] as const) {
    const wrote = await withTenant(u.tenantId, (tx) =>
      recordNotification(tx, {
        tenantId: u.tenantId,
        userId: u.userId,
        type: 'SAVED_SEARCH_MATCH',
        payload: { searchId: `s-${itemName(u, n)}`, searchName: itemName(u, n), matchCount: 2, since: new Date().toISOString() },
      }),
    );
    expect(wrote, `store wrote ${n} for ${u.userId}`).toBe(true);
  }
}

/** searchName → readAt (ISO or null) of the user's rows, straight from the table. */
async function readState(u: typeof A): Promise<Record<string, string | null>> {
  const rows = await withSystemScope('platform-admin', 'e2e.notif.check', (tx) =>
    tx.notification.findMany({ where: { tenantId: u.tenantId, userId: u.userId }, select: { payload: true, readAt: true } }),
  );
  return Object.fromEntries(
    rows.map((r) => [String((r.payload as { searchName?: unknown }).searchName), r.readAt ? r.readAt.toISOString() : null]),
  );
}

const row = (scope: Page | Locator, u: typeof A, n: 'n1' | 'n2') =>
  scope.getByRole('button', { name: new RegExp(`"${itemName(u, n)}"`) });

test.describe('Notification center — read/unread flows (store-backed)', () => {
  test.beforeEach(async () => {
    await seedTwoUnread(A);
  });

  test.afterEach(async () => {
    await clearNotifications(A);
    await clearNotifications(B);
  });

  test('badge shows 2 unread; clicking one drops it to 1 and writes readAt for that row only', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    await row(page, A, 'n1').click();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();

    const state = await readState(A);
    expect(state[itemName(A, 'n1')], 'n1 read on the server').not.toBeNull();
    expect(state[itemName(A, 'n2')], 'n2 still unread').toBeNull();
  });

  test('mark all as read from the header button', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Mark All as Read' }).click();
    await expect(page.getByText('All Notifications Read')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark All as Read' })).toHaveCount(0);

    const state = await readState(A);
    expect(Object.values(state)).toHaveLength(2);
    expect(Object.values(state).every((readAt) => readAt !== null), 'both rows read on the server').toBe(true);
  });

  test('read state survives a reload and a fresh page', async ({ page, context }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await row(page, A, 'n1').click();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 Unread Notification', { exact: true })).toBeVisible();

    const fresh = await context.newPage();
    await fresh.goto(`/tr/${A.ws.slug}/bildirimler`);
    await expect(fresh.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();
    await expect(fresh.getByText('1 Okunmamış Bildirim', { exact: true })).toBeVisible();
    await fresh.close();
  });

  test('bell: unread dot, click an item → 1 unread, mark all → dot clears and stays cleared', async ({ page }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/dashboard`);
    const bell = page.getByRole('button', { name: 'Notifications' });
    // The unread dot is the only span inside the bell button.
    await expect(bell.locator('span')).toHaveCount(1);

    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('2 Unread', { exact: true })).toBeVisible();
    await row(panel, A, 'n1').click();
    await expect(panel.getByText('1 Unread', { exact: true })).toBeVisible();
    await expect(bell.locator('span')).toHaveCount(1);

    await panel.getByRole('button', { name: 'Mark All Read' }).click();
    await expect(panel.getByText('All Read', { exact: true })).toBeVisible();
    await expect(bell.locator('span')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(0);
    expect(Object.values(await readState(A)).every((readAt) => readAt !== null)).toBe(true);
  });

  test('another tab marking read updates this tab when it regains focus', async ({ page, context }) => {
    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(1);

    // Second tab, same session: mark everything read from its bell.
    const other = await context.newPage();
    await other.goto(`/en/${A.ws.slug}/dashboard`);
    const otherBell = other.getByRole('button', { name: 'Notifications' });
    await expect(otherBell.locator('span')).toHaveCount(1);
    await otherBell.click();
    await other.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: 'Mark All Read' }).click();
    await expect(otherBell.locator('span')).toHaveCount(0);
    expect(Object.values(await readState(A)).every((readAt) => readAt !== null)).toBe(true);

    // The first tab has not refetched yet: no reload, no storage event any more.
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();

    // Back to the first tab: focus → page refresh + bell refetch. Headless
    // Chromium keeps every page 'visible' and focused, and bringToFront() fires
    // neither `focus` nor `visibilitychange` (measured), so the event a real
    // tab switch fires is dispatched here; what it triggers is not stubbed.
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('All Notifications Read')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(0);
    await other.close();
  });

  test("B's reads do not mark A's notifications read", async ({ page }) => {
    await seedTwoUnread(B);

    await signIn(page, B);
    await page.goto(`/en/${B.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
    // B sees only B's rows.
    await expect(row(page, A, 'n1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark All as Read' }).click();
    await expect(page.getByText('All Notifications Read')).toBeVisible();

    expect(Object.values(await readState(B)).every((readAt) => readAt !== null), "B's rows read").toBe(true);
    expect(Object.values(await readState(A)), "A's rows untouched").toEqual([null, null]);

    await signIn(page, A);
    await page.goto(`/en/${A.ws.slug}/notifications`);
    await expect(page.getByText('2 Unread Notifications', { exact: true })).toBeVisible();
    await expect(row(page, A, 'n1')).toBeVisible();
    await expect(row(page, A, 'n2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' }).locator('span')).toHaveCount(1);
  });
});

/*
 * The producer (ADR-0011 K-6 a): alerts-daily's per-search loop writes the
 * notification for the search's OWNER (`SavedSearch.userId`), not for the
 * tenant owner, and with no mail provider at all. Own tenant P with an owner
 * and a MEMBER; the MEMBER owns the search. Matches come from the seeded
 * Topic rows (db:seed), read-only.
 */
test.describe('Notification center — producer: saved-search alert reaches the searcher', () => {
  const P = {
    tenantId: `e2e-notif-p-${RUN}`,
    owner: { userId: `e2e-notif-p-owner-${RUN}`, email: `notif-p-owner-${RUN}@e2e-notif.test` },
    member: { userId: `e2e-notif-p-member-${RUN}`, email: `notif-p-member-${RUN}@e2e-notif.test` },
    ws: { id: `e2e-notif-p-ws-${RUN}`, slug: `notif-p-${RUN}`, name: 'Notif P' },
  };
  const SEARCH_NAME = `producer-${RUN}`;
  const LONG_AGO = new Date('2000-01-01T00:00:00.000Z');
  let searchId = '';

  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.notif.seed', async (tx) => {
      await tx.tenant.create({
        data: { id: P.tenantId, name: `Notif E2E ${P.tenantId}`, slug: P.tenantId, country: 'TR', orgType: 'SME' },
      });
    });
    await seedIdentity({ ...P.owner, role: 'TENANT_OWNER', tenantId: P.tenantId }, P.ws);
    await seedIdentity({ ...P.member, role: 'MEMBER', tenantId: P.tenantId }, P.ws);
    const search = await withSystemScope('platform-admin', 'e2e.notif.seed', (tx) =>
      tx.savedSearch.create({
        data: { tenantId: P.tenantId, userId: P.member.userId, name: SEARCH_NAME, filters: {}, notify: true, lastRunAt: LONG_AGO },
      }),
    );
    searchId = search.id;
  });

  test.afterAll(async () => {
    await cleanupIdentity([P.owner.userId, P.member.userId]);
    await withSystemScope('platform-admin', 'e2e.notif.cleanup', async (tx) => {
      const tenantId = requireId(P.tenantId, 'tenantId');
      await tx.notification.deleteMany({ where: { tenantId } });
      await tx.savedSearch.deleteMany({ where: { tenantId } });
      await tx.workspace.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });
  });

  test("sendSavedSearchAlerts writes one SAVED_SEARCH_MATCH for SavedSearch.userId; it shows in that user's bell only", async ({ page }) => {
    const search = {
      id: requireId(searchId, 'searchId'),
      tenantId: P.tenantId,
      userId: P.member.userId,
      name: SEARCH_NAME,
      filters: {},
      lastRunAt: LONG_AGO,
      createdAt: LONG_AGO,
    };
    // No mail provider: the e-mail fails (lastRunAt stays), the in-app notification is written anyway.
    const result = await sendSavedSearchAlerts([search], withTenant, null);
    expect(result.errors).toEqual([{ searchId: search.id, reason: 'no_mail_provider' }]);

    const written = await withSystemScope('platform-admin', 'e2e.notif.check', (tx) =>
      tx.notification.findMany({ where: { tenantId: P.tenantId }, select: { userId: true, type: true, payload: true } }),
    );
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ userId: P.member.userId, type: 'SAVED_SEARCH_MATCH' });
    expect(written[0]!.payload).toMatchObject({ searchId: search.id, searchName: SEARCH_NAME });
    const matchCount = (written[0]!.payload as { matchCount: number }).matchCount;
    expect(matchCount).toBeGreaterThan(0);

    // The searcher's bell.
    await signInAs(page, { id: P.member.userId, email: P.member.email, tenantId: P.tenantId, role: 'MEMBER' });
    await page.goto(`/en/${P.ws.slug}/dashboard`);
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell.locator('span')).toHaveCount(1);
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('New match found')).toBeVisible();
    await expect(panel.getByText(new RegExp(`call(s)? matched "${SEARCH_NAME}"`))).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/producer-member-bell.png` });

    // The tenant owner gets nothing.
    await signInAs(page, { id: P.owner.userId, email: P.owner.email, tenantId: P.tenantId, role: 'TENANT_OWNER' });
    await page.goto(`/en/${P.ws.slug}/dashboard`);
    const ownerBell = page.getByRole('button', { name: 'Notifications' });
    await expect(ownerBell).toBeVisible();
    await expect(ownerBell.locator('span')).toHaveCount(0);
    await ownerBell.click();
    await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText('You have no notifications yet.')).toBeVisible();
  });
});

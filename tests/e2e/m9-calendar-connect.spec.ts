import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { F10, seed, rollback } from '../../scripts/seed-f10-e2e';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTQUTBH8Q9VMK — the calendar connect flow, in a real browser.
 *
 * The card's complaint was that the flow "is never visible". It was literally
 * invisible: `handleConnect` ran `console.log('Connecting to google...')` and
 * a `TODO`, so a click flipped a disabled attribute for one frame and left the
 * page exactly as it was — no OAuth, no row, no message, success or failure.
 *
 * Both outcomes are asserted, because showing nothing and showing a made-up
 * success are the two ways this screen has been wrong:
 *   • `.ics` needs no authorisation, so connecting it must really connect.
 *   • Google has no OAuth client and no callback route in this deployment, so
 *     it must be refused in the user's language — not stored as a connection
 *     that can never carry an event.
 */

const SHOTS = shotsDir('TASK-MTQUTBH8Q9VMK-screenshots');
const calendarSettingsUrl = (workspace: string) => `/tr/${workspace}/settings/calendar`;

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

/**
 * A minted session for the user `seed()` wrote (scripts/seed-f10-e2e.ts seats it as
 * TENANT_OWNER of its own tenant), instead of the demo sign-in form, so the spec runs
 * against `next start` too (TASK-MUSBCXP9RKS3D). The seed already writes User +
 * Membership and `rollback` removes them, so the session fixture only adds the cookie.
 */
async function signIn(page: Page, email: string, target: string) {
  const seat = [F10.full, F10.empty].find((t) => t.email === email);
  if (!seat) throw new Error(`no F10 fixture user with e-mail ${email}`);
  await signInAs(page, { id: seat.userId, email: seat.email, tenantId: seat.tenantId, role: 'TENANT_OWNER' });
  await page.goto(target);
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
  // No network-idle wait — see docs/E2E_TESTING.md §3.4: on a dev server
  // "no requests for 500 ms" is a race, not a signal. The assertions below do the waiting.
}

/** One provider card: the rounded panel carrying that provider's label. */
const providerCard = (page: Page, label: string) =>
  page.locator('div.rounded-2xl').filter({ hasText: label });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/** The fixture user must start with no calendar connection, and end with none. */
async function clearConnections() {
  await prisma.calendarConnection.deleteMany({
    where: { tenantId: requireId(F10.full.tenantId, 'F10.full.tenantId'), userId: requireId(F10.full.userId, 'F10.full.userId') },
  });
}

test.describe('M9 calendar connections', () => {
  test.beforeAll(async () => {
    await seed();
    await clearConnections();
  });

  test.afterAll(async () => {
    // The connections first, then the fixture that owns them: `rollback` deletes the
    // user these rows point at, and a row left behind would hold it down.
    await clearConnections();
    // This suite used to seed and never roll back, so `f10-*` stayed in the shared
    // database after every run — two tenants, two users, two workspaces, and the
    // opportunities the dashboard counts. Whoever seeds cleans up.
    if (process.env.F10_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('an unconfigured provider is refused in Turkish, not silently swallowed', async ({
    page,
  }) => {
    await acceptCookies(page);
    await signIn(page, F10.full.email, calendarSettingsUrl(F10.full.workspaceSlug));

    await providerCard(page, 'Google Calendar').getByRole('button', { name: 'Bağla', exact: true }).click();

    // The banner, not the card's own description: both carry the same sentence,
    // and asserting on the text alone would pass even if the click did nothing.
    // Next.js mounts its own role="alert" route announcer; exclude it.
    const banner = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Bu sağlayıcı henüz bağlanamıyor');
    // The button must return to rest, not stay stuck on "Bağlanıyor…".
    await expect(
      providerCard(page, 'Google Calendar').getByRole('button', { name: 'Bağla', exact: true }),
    ).toBeEnabled();
    await shot(page, 'connect-google-refused');

    // Refused means refused: no half-connection was written.
    const rows = await prisma.calendarConnection.count({
      where: { tenantId: F10.full.tenantId, userId: F10.full.userId },
    });
    expect(rows).toBe(0);
  });

  test('offers Google Calendar and .ics only — Outlook is gone, in both locales', async ({
    page,
  }) => {
    // TASK-MUMMIHYY2F4KB — owner decision 29.09: M9 ships Google Calendar + .ics.
    await acceptCookies(page);
    await signIn(page, F10.full.email, calendarSettingsUrl(F10.full.workspaceSlug));

    for (const locale of ['tr', 'en'] as const) {
      if (locale === 'en') await page.goto(`/en/${F10.full.workspaceSlug}/settings/calendar`);
      await expect(providerCard(page, 'Google Calendar')).toHaveCount(1);
      await expect(providerCard(page, '.ics File Import')).toHaveCount(1);
      await expect(page.getByText(/Outlook|Microsoft/)).toHaveCount(0);
      await shot(page, `providers-no-outlook-${locale}`);
    }
  });

  test('the browser tab title follows the locale', async ({ page }) => {
    // Was `export const metadata = { title: 'Takvim Bağlantıları' }`, so the
    // English page carried a Turkish tab title.
    await acceptCookies(page);
    await signIn(page, F10.full.email, calendarSettingsUrl(F10.full.workspaceSlug));
    await expect(page).toHaveTitle(/Takvim Bağlantıları/);

    await page.goto(`/en/${F10.full.workspaceSlug}/settings/calendar`);
    // `toHaveTitle` retries until the timeout, so it waits for the new document itself.
    await expect(page).toHaveTitle(/Calendar Connections/);
  });

  test('.ics connects for real and the screen reflects the stored row', async ({ page }) => {
    await acceptCookies(page);
    await signIn(page, F10.full.email, calendarSettingsUrl(F10.full.workspaceSlug));

    await providerCard(page, '.ics File Import').getByRole('button', { name: 'Bağla', exact: true }).click();

    await expect(page.getByText('Bağlı', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Bağlı — henüz senkronize edilen bir toplantı yok.')).toBeVisible();
    await shot(page, 'connect-ics-connected');

    // `isConnected` on the row is true, matching what the screen says. It used
    // to be written as `false` while the action returned `{ success: true }`.
    const row = await prisma.calendarConnection.findFirst({
      where: { tenantId: F10.full.tenantId, userId: F10.full.userId, provider: 'ics' },
    });
    expect(row?.isConnected).toBe(true);
    expect(row?.lastSyncAt).toBeNull();
  });

  test('.ics disconnects for real and the row leaves the database', async ({ page }) => {
    // TASK-MTVR7W9ZXO7M — the disconnect half of the same screen, after both
    // queries moved inside `withTenant` and the delete gained the owner in its
    // `where`. The row-level guarantees are pinned in
    // `tests/m9-calendar-tenant-scope.live.test.ts`; what this test proves is
    // that the happy path still works from a real click.
    //
    // The connected row is seeded rather than clicked into place: the connect
    // flow ends in `window.location.reload()`, and starting a second click while
    // that reload is in flight raced the button out from under Playwright.
    // Connecting by click is already covered by the test above.
    // The connect test above leaves its `.ics` row behind, and
    // `@@unique([tenantId, userId, provider])` would reject a second one.
    await clearConnections();
    const seeded = await prisma.calendarConnection.create({
      data: {
        tenantId: F10.full.tenantId,
        userId: F10.full.userId,
        provider: 'ics',
        isConnected: true,
      },
    });

    await acceptCookies(page);
    // The Disconnect button is behind `confirm()`; Playwright dismisses dialogs
    // by default, which would make this test pass without ever disconnecting.
    page.on('dialog', (dialog) => dialog.accept());
    await signIn(page, F10.full.email, calendarSettingsUrl(F10.full.workspaceSlug));

    const icsCard = providerCard(page, '.ics File Import');
    await expect(icsCard.getByText('Bağlı', { exact: true })).toBeVisible({ timeout: 15_000 });

    await icsCard.getByRole('button', { name: 'Bağlantısını Kes' }).click();

    // The screen returns to its unconnected state — the action reloads the page,
    // so this waits for the fresh document.
    //
    // `exact: true` is what makes this a wait at all (TASK-MULXYY4DPRBCF). A role
    // name matches as a case-insensitive substring by default, and "Bağla" is a
    // prefix of "Bağlantısını Kes" — so the button just clicked satisfied this
    // assertion instantly, the query below ran before the server action had
    // deleted anything, and `afterAll` then removed the row under the in-flight
    // action (CI 36499253610: CALENDAR_CONNECTION_NOT_FOUND after "rolled back").
    await expect(
      providerCard(page, '.ics File Import').getByRole('button', { name: 'Bağla', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(icsCard.getByText('Bağlı', { exact: true })).toHaveCount(0);
    await shot(page, 'disconnect-ics-removed');

    // Asked of the database, not of the return value: `deleteMany` must have
    // matched the row, not reported a count over an untouched table.
    const survivor = await prisma.calendarConnection.findUnique({ where: { id: seeded.id } });
    expect(survivor).toBeNull();
  });
});

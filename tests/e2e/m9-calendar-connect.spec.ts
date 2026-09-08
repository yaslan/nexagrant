import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { F10, seed, rollback } from '../../scripts/seed-f10-e2e';

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

const SHOTS = 'docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots';
const calendarSettingsUrl = (workspace: string) => `/tr/${workspace}/settings/calendar`;

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function signIn(page: Page, email: string, target: string) {
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
  // No `waitForLoadState('networkidle')` — see docs/E2E_TESTING.md §3.4: on a dev server
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
    where: { tenantId: F10.full.tenantId, userId: F10.full.userId },
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

    await providerCard(page, 'Google Calendar').getByRole('button', { name: 'Bağla' }).click();

    // The banner, not the card's own description: both carry the same sentence,
    // and asserting on the text alone would pass even if the click did nothing.
    // Next.js mounts its own role="alert" route announcer; exclude it.
    const banner = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Bu sağlayıcı henüz bağlanamıyor');
    // The button must return to rest, not stay stuck on "Bağlanıyor…".
    await expect(
      providerCard(page, 'Google Calendar').getByRole('button', { name: 'Bağla' }),
    ).toBeEnabled();
    await shot(page, 'connect-google-refused');

    // Refused means refused: no half-connection was written.
    const rows = await prisma.calendarConnection.count({
      where: { tenantId: F10.full.tenantId, userId: F10.full.userId },
    });
    expect(rows).toBe(0);
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

    await providerCard(page, '.ics File Import').getByRole('button', { name: 'Bağla' }).click();

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
});

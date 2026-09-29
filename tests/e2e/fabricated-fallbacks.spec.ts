import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { F10, seed, rollback } from '../../scripts/seed-f10-e2e';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTQYXISOPUJ53 — fabricated data fallbacks, in a real browser.
 *
 * Two screens that used to show invented rows to every tenant on every visit:
 *
 *   • /reports/person-days  opened with a `MOCK_REPORTS` constant (Alice 12.5h,
 *     Bob 8h, Charlie 16h → 40.5 hours / 5.1 PDs) and never queried anything.
 *   • /bildirimler          built four notifications in code, two of which made
 *     claims a user would act on (an SME declaration "expiring in 15 days", a
 *     "500 AI credits" allocation). There is no notification model in the
 *     schema at all.
 *
 * Both halves are asserted, because suppressing everything is the cheap fix
 * that breaks the real path: a workspace WITH effort must still show its real
 * figure, and a workspace without must say so rather than print someone else's.
 *
 * The fixture is the F10 one: `f10-full-ws` has a single 40-hour Effort row on
 * "F10 — renovation pilot"; `f10-empty-ws` has none. Both have M5 enabled.
 */

const SHOTS = shotsDir('TASK-MTQYXISOPUJ53-screenshots');

const personDaysUrl = (workspace: string) => `/tr/${workspace}/reports/person-days`;
const notificationsUrl = (workspace: string) => `/tr/${workspace}/bildirimler`;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
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
  // No network-idle wait: a dev server never goes quiet for the 500 ms
  // it waits for, so it is a race and not a signal — it timed this suite out at 60 s on
  // a loaded machine. Every caller asserts on a locator next, which is the real wait.
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/**
 * File scope, not per-describe: both suites below seed the same fixture, and this runs
 * once after the last of them. The suites used to seed and never roll back, which left
 * `f10-*` — two tenants, two users, two workspaces and the opportunities the dashboard
 * counts — in the shared database after every run.
 */
test.afterAll(async () => {
  if (process.env.F10_E2E_KEEP !== '1') await rollback();
  await prisma.$disconnect();
});

/** The three people the mock array invented, and the work it invented for them. */
const INVENTED_EFFORT = [
  'Advanced AI solutions for climate modeling',
  'Quantum computing algorithms for SMEs',
  'Smart grids optimization',
];

/** The four notifications the page used to build in code. */
const INVENTED_NOTIFICATIONS = [
  'Yeni Çağrı Eşleşmesi',
  'Kanıt Belgesi Uyarısı',
  'Aylık Kredi Tanımlandı',
  'Konsorsiyum Daveti Güncellemesi',
];

test.describe('person-days report — real effort, or none', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test('a workspace with logged effort shows its own figure, not the mock array', async ({
    page,
  }) => {
    await acceptCookies(page);
    await signIn(page, F10.full.email, personDaysUrl(F10.full.workspaceSlug));

    // The one real Effort row: 40 hours on "F10 — renovation pilot" = 5.0 PDs.
    await expect(page.getByRole('cell', { name: 'F10 — renovation pilot' })).toBeVisible();
    await expect(page.getByText('40', { exact: false }).first()).toBeVisible();

    for (const invented of INVENTED_EFFORT) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
    await expect(page.getByText('Alice')).toHaveCount(0);
    await expect(page.getByText('Charlie')).toHaveCount(0);

    await shot(page, 'person-days-real-effort');
  });

  test('a workspace with no effort says so instead of borrowing someone else’s', async ({
    page,
  }) => {
    await acceptCookies(page);
    await signIn(page, F10.empty.email, personDaysUrl(F10.empty.workspaceSlug));

    await expect(page.getByText('Henüz efor kaydı yok.')).toBeVisible();
    for (const invented of INVENTED_EFFORT) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    await shot(page, 'person-days-empty');
  });
});

test.describe('notifications — an empty feed reads as empty', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test('none of the four invented notifications is rendered', async ({ page }) => {
    await acceptCookies(page);
    await signIn(page, F10.full.email, notificationsUrl(F10.full.workspaceSlug));

    for (const invented of INVENTED_NOTIFICATIONS) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
    await expect(page.getByText('Henüz bildiriminiz yok.').first()).toBeVisible();

    await shot(page, 'notifications-empty');
  });

  test('the header bell does not carry its own invented feed either', async ({ page }) => {
    // The page was cleaned first and the bell was not: the screenshot of the
    // empty notifications page still showed a pulsing unread dot in the shell,
    // because src/components/UserMenu.tsx held three more hard-coded items.
    await acceptCookies(page);
    await signIn(page, F10.full.email, notificationsUrl(F10.full.workspaceSlug));

    await page.getByRole('button', { name: 'Bildirimler' }).click();
    await expect(page.getByText('Henüz bildiriminiz yok.').first()).toBeVisible();
    await expect(page.getByText('Kredi Yüklemesi')).toHaveCount(0);
    await expect(page.getByText('HORIZON-CL5-2026-D3 %92 uyumlu')).toHaveCount(0);
    await expect(page.getByText('Tümü Okundu')).toBeVisible();

    await shot(page, 'notification-bell-empty');
  });
});

import { test, expect, type Page, type Request } from '@playwright/test';
import { E2E_POSTHOG_HOST } from './fixtures/analytics';
import { expectHydrated } from './fixtures/hydration';
import { COOKIE_POLICY_VERSION } from '../../src/lib/cookie-consent';

/**
 * NG-371 — a stored cookie answer expires. A choice older than 365 days, or one made
 * against another policy version, is no longer an answer: the banner comes back and
 * analytics stays off until the visitor answers again. The answer that is kept is
 * the one still inside the window (control case).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = 'fabrika_cookie_consent';

const banner = (page: Page) => page.getByRole('alertdialog');

/** Seeds a stored answer before the page's own scripts run (the same way the other e2e specs do). */
async function seedAnswer(page: Page, ageDays: number) {
  const value = JSON.stringify({
    necessary: true,
    analytics: true,
    marketing: true,
    accepted: true,
    level: 'all',
    time: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
    version: COOKIE_POLICY_VERSION,
  });
  await page.addInitScript((v: string) => window.localStorage.setItem('fabrika_cookie_consent', v), value);
}

function watchAnalytics(page: Page) {
  const requests: string[] = [];
  const onRequest = (request: Request) => {
    if (request.url().startsWith(E2E_POSTHOG_HOST)) requests.push(request.url());
  };
  page.on('request', onRequest);
  return requests;
}

/** A same-origin request after the page's own ones: once it is seen, anything sent before has been counted. */
async function settle(page: Page) {
  const sentinel = page.waitForRequest((r) => r.url().includes('/favicon.ico?ng371-settle'));
  await page.evaluate(() => void fetch('/favicon.ico?ng371-settle').catch(() => undefined));
  await sentinel;
}

test.describe('NG-371 cookie answer expires after 12 months', () => {
  test('a 400-day-old answer re-opens the banner, analytics stays off, accepting renews the date', async ({ page }) => {
    await seedAnswer(page, 400);
    const analyticsRequests = watchAnalytics(page);

    await page.goto('/tr');
    await expectHydrated(banner(page).getByRole('button', { name: 'Tümünü Kabul Et' }));
    await expect(banner(page)).toBeVisible();
    await settle(page);
    expect(analyticsRequests, 'analytics requests while the answer is expired').toEqual([]);

    await banner(page).getByRole('button', { name: 'Tümünü Kabul Et' }).click();
    await expect(banner(page)).toBeHidden();

    const stored = JSON.parse(
      (await page.evaluate((k) => window.localStorage.getItem(k), KEY)) ?? '{}',
    ) as { time?: string; version?: string; analytics?: boolean };
    expect(stored.analytics).toBe(true);
    expect(stored.version).toBe(COOKIE_POLICY_VERSION);
    expect(Date.now() - Date.parse(stored.time ?? '')).toBeLessThan(60 * 1000);
  });

  test('a 30-day-old answer keeps the banner closed (control)', async ({ page }) => {
    await seedAnswer(page, 30);
    await page.goto('/tr');
    await expectHydrated(page.locator('body'));
    await expect(banner(page)).toBeHidden();
  });
});

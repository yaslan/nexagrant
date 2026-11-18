import { test, expect, type Page, type Request } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { CONSENT_VISITOR_ID_STORAGE_KEY, CONSENT_STORAGE_KEY } from '../../src/lib/cookie-consent';
import { E2E_POSTHOG_HOST } from './fixtures/analytics';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';

/**
 * NG-9 (FE-1.5) — our own cookie banner, its preference panel, the consent record
 * in our own database, and the pixel gate.
 *
 *  1. Before an analytics choice is "on", no analytics or ad-pixel request leaves
 *     the browser — not on load, not on "reject", not on an event the page fires.
 *     The e2e server runs with a fixture PostHog key and the fixture host below
 *     (playwright.config.ts), so the gate is the only thing that can hold a
 *     request back. Every request to it is fulfilled here and counted.
 *  2. Every saved choice writes one CookieConsentRecord row (anonymous visitor id,
 *     categories, policy version, time). Counted in the database.
 *  3. Withdrawing stops the flow again.
 */

const SHOTS = shotsDir('NG-9-evidence');

/** Hosts a tracking pixel or analytics script would come from. None may be asked before consent. */
const PIXEL_HOSTS = /posthog|google-analytics|googletagmanager|doubleclick|facebook\.(net|com)|connect\.facebook|linkedin|licdn|hotjar|clarity\.ms|yandex/i;

const COPY = {
  tr: {
    readiness: '/tr/fon-hazirlik',
    home: '/tr',
    reject: 'Gerekli Çerezler',
    accept: 'Tümünü Kabul Et',
    manage: 'Tercihleri yönet',
    analytics: 'Analitik',
    marketing: 'Pazarlama',
    save: 'Seçimimi kaydet',
    start: 'Teste başla',
    link: 'Çerez tercihleri',
  },
  en: {
    readiness: '/en/funding-readiness',
    home: '/en',
    reject: 'Essential Only',
    accept: 'Accept All',
    manage: 'Manage preferences',
    analytics: 'Analytics',
    marketing: 'Marketing',
    save: 'Save my choice',
    start: 'Start the check',
    link: 'Cookie preferences',
  },
} as const;

const banner = (page: Page) => page.getByRole('alertdialog');

function watchPixels(page: Page) {
  const pixelRequests: string[] = [];
  const onRequest = (request: Request) => {
    if (PIXEL_HOSTS.test(new URL(request.url()).hostname)) pixelRequests.push(request.url());
  };
  page.on('request', onRequest);
  return pixelRequests;
}

async function fulfilCapture(page: Page) {
  await page.route(`${E2E_POSTHOG_HOST}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
      body: '{"status":1}',
    }),
  );
}

async function visitorId(page: Page): Promise<string> {
  const id = await page.evaluate((k) => window.localStorage.getItem(k), CONSENT_VISITOR_ID_STORAGE_KEY);
  expect(id, 'consent visitor id in localStorage').toMatch(/^[0-9a-f-]{36}$/);
  return id as string;
}

async function recordCount(id: string): Promise<number> {
  return prisma.cookieConsentRecord.count({ where: { visitorId: id } });
}

async function startReadiness(page: Page, locale: 'tr' | 'en') {
  await page.goto(COPY[locale].readiness);
  const start = page.getByRole('button', { name: COPY[locale].start });
  await expectHydrated(start);
  await page.locator('input[name="orgType"]').first().check();
  await start.click();
  // The check moved on to its first step: `readiness_started` has been tracked (or held back).
  await expect(start).toBeHidden();
}

/**
 * A negative check needs a point after which a held-back request would already have been
 * seen. `track()` calls fetch synchronously inside the click handler, so a same-origin
 * sentinel fetched afterwards is reported after it — once the sentinel is seen, anything
 * the page sent before it has been counted. (`networkidle` is banned here: next dev never
 * goes idle.) The positive step in the first test proves the same action does send.
 */
async function settle(page: Page) {
  const sentinel = page.waitForRequest((r) => r.url().includes('/favicon.ico?ng9-settle'));
  await page.evaluate(() => void fetch('/favicon.ico?ng9-settle').catch(() => undefined));
  await sentinel;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('NG-9 pixel gate and consent record', () => {
  test('no analytics request before consent; one after opting in; none after withdrawing', async ({ page }) => {
    const c = COPY.tr;
    await fulfilCapture(page);
    const pixels = watchPixels(page);

    // First visit: the banner is up, nothing has been asked yet.
    await page.goto(c.readiness);
    await expect(banner(page)).toBeVisible();
    await expectHydrated(banner(page).getByRole('button', { name: c.reject }));
    await settle(page);
    expect(pixels, 'pixel/analytics requests before any answer').toEqual([]);

    // "Reject": analytics stays off; an event the page fires goes nowhere.
    await banner(page).getByRole('button', { name: c.reject }).click();
    await expect(banner(page)).toBeHidden();
    await startReadiness(page, 'tr');
    await settle(page);
    expect(pixels, 'pixel/analytics requests after "reject"').toEqual([]);

    // The panel: analytics on, marketing off → the same event now goes out.
    await page.getByTestId('public-footer').getByRole('button', { name: c.link }).click();
    await banner(page).getByRole('button', { name: c.manage }).click();
    await banner(page).getByRole('switch', { name: c.analytics }).click();
    await expect(banner(page).getByRole('switch', { name: c.marketing })).toHaveAttribute('aria-checked', 'false');
    await banner(page).getByRole('button', { name: c.save }).click();
    await expect(banner(page)).toBeHidden();
    await startReadiness(page, 'tr');
    await expect.poll(() => pixels.length).toBeGreaterThan(0);
    expect(pixels.every((url) => url.startsWith(`${E2E_POSTHOG_HOST}/i/v0/e/`))).toBe(true);

    // Withdraw: back to "reject", and the flow stops.
    await page.getByTestId('public-footer').getByRole('button', { name: c.link }).click();
    await banner(page).getByRole('button', { name: c.reject }).click();
    await expect(banner(page)).toBeHidden();
    const sent = pixels.length;
    await startReadiness(page, 'tr');
    await settle(page);
    expect(pixels.length, 'requests after withdrawing').toBe(sent);
  });

  test('every saved choice writes one consent record (database row count)', async ({ page }) => {
    const c = COPY.tr;
    await fulfilCapture(page);
    await page.goto(c.home);
    await expect(banner(page)).toBeVisible();
    // Nothing is recorded, and no id exists, before an answer.
    expect(await page.evaluate((k) => window.localStorage.getItem(k), CONSENT_VISITOR_ID_STORAGE_KEY)).toBeNull();

    await banner(page).getByRole('button', { name: c.reject }).click();
    await expect(banner(page)).toBeHidden();
    const id = await visitorId(page);
    await expect.poll(() => recordCount(id)).toBe(1);

    // Change the choice in the panel: a new row, the old one kept.
    await page.getByTestId('public-footer').getByRole('button', { name: c.link }).click();
    await banner(page).getByRole('button', { name: c.manage }).click();
    await banner(page).getByRole('switch', { name: c.analytics }).click();
    await banner(page).getByRole('button', { name: c.save }).click();
    await expect(banner(page)).toBeHidden();
    await expect.poll(() => recordCount(id)).toBe(2);

    await page.getByTestId('public-footer').getByRole('button', { name: c.link }).click();
    await banner(page).getByRole('button', { name: c.accept }).click();
    await expect.poll(() => recordCount(id)).toBe(3);

    const rows = await prisma.cookieConsentRecord.findMany({ where: { visitorId: id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.choice, r.analytics, r.marketing])).toEqual([
      ['reject_all', false, false],
      ['custom', true, false],
      ['accept_all', true, true],
    ]);
    expect(rows.every((r) => r.policyVersion.length > 0)).toBe(true);
    // What the browser holds matches the last row.
    const stored = JSON.parse((await page.evaluate((k) => window.localStorage.getItem(k), CONSENT_STORAGE_KEY)) ?? '{}');
    expect(stored).toMatchObject({ analytics: true, marketing: true, necessary: true });
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`banner and preference panel (${locale}) — evidence frames`, async ({ page }) => {
      const c = COPY[locale];
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(c.home);
      await expect(banner(page)).toBeVisible();
      // "Reject" and "Accept" carry the same weight: same size, same style class.
      const reject = banner(page).getByRole('button', { name: c.reject });
      const accept = banner(page).getByRole('button', { name: c.accept });
      expect(await reject.getAttribute('class')).toBe(await accept.getAttribute('class'));
      await page.screenshot({ path: `${SHOTS}/banner-${locale}.png` });

      await banner(page).getByRole('button', { name: c.manage }).click();
      // Default: everything but the essential category is off; essential cannot be switched off.
      await expect(banner(page).getByRole('switch', { name: c.analytics })).toHaveAttribute('aria-checked', 'false');
      await expect(banner(page).getByRole('switch', { name: c.marketing })).toHaveAttribute('aria-checked', 'false');
      await page.screenshot({ path: `${SHOTS}/panel-${locale}.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${SHOTS}/panel-${locale}-mobile.png` });
    });
  }
});

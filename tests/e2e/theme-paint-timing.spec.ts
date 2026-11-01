import { test, expect } from '@playwright/test';

/**
 * The theme must be on <html> before any JavaScript runs.
 *
 * The measurement is unchanged — chunks are stalled for three seconds and the class
 * is read after `domcontentloaded`, so nothing client-side can have applied it. What
 * changed is the mechanism under test: a parse-time <script> used to write the class
 * from localStorage; now the server reads the `fabrika-theme` cookie and renders the
 * class into the HTML itself (src/app/layout.tsx). The preference is therefore set
 * as a cookie here, not in localStorage — that is the only edit to these two tests.
 *
 * Still two-way: delete the `className`/`data-theme` on <html> in the root layout and
 * both tests go red, because ThemeProvider's effect cannot run while chunks are held.
 */

// The same origin playwright.config.ts serves the app on (E2E_BASE_URL / E2E_PORT).
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3000}`;

async function setThemeCookie(
  context: import('@playwright/test').BrowserContext,
  value: 'light' | 'dark' | 'system'
) {
  await context.addCookies([{ name: 'fabrika-theme', value, url: BASE_URL }]);
}

test('the theme is in the server HTML, before chunk JS loads', async ({ page, context }) => {
  const chunksBlockedUntil = Date.now() + 3000;

  // Block all JS chunks for 3 seconds
  await page.route('**/_next/static/chunks/**', async (route) => {
    const now = Date.now();
    if (now < chunksBlockedUntil) {
      await new Promise((r) => setTimeout(r, chunksBlockedUntil - now + 100));
    }
    route.continue().catch(() => {});
  });

  // Set dark theme before page load
  await setThemeCookie(context, 'dark');

  // Navigate and wait for dom content loaded (HTML parsed)
  // Chunks are still blocked at this point
  await page.goto(`${BASE_URL}/tr`, {
    waitUntil: 'domcontentloaded'
  });

  // Measure: is dark class present BEFORE chunks load?
  // If the server resolved the cookie, the class arrived with the document.
  // If only ThemeProvider (useEffect) applies it, dark class won't exist.
  const isDarkBeforeChunks = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });

  expect(isDarkBeforeChunks).toBe(true);
});

test('theme applies immediately on both locales before chunks load', async ({ page, context }) => {
  // Test both Turkish and English locales with chunks delayed

  // Dark theme test
  let chunksBlockedUntil = Date.now() + 3000;
  await page.route('**/_next/static/chunks/**', async (route) => {
    const now = Date.now();
    if (now < chunksBlockedUntil) {
      await new Promise((r) => setTimeout(r, chunksBlockedUntil - now + 100));
    }
    route.continue().catch(() => {});
  });

  await setThemeCookie(context, 'dark');

  await page.goto(`${BASE_URL}/tr`, { waitUntil: 'domcontentloaded' });
  const isDarkBeforeChunks = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  );
  expect(isDarkBeforeChunks).toBe(true);

  // Light theme test on different locale
  await page.reload({ waitUntil: 'domcontentloaded' });
  chunksBlockedUntil = Date.now() + 3000;
  await page.unroute('**/_next/static/chunks/**');
  await page.route('**/_next/static/chunks/**', async (route) => {
    const now = Date.now();
    if (now < chunksBlockedUntil) {
      await new Promise((r) => setTimeout(r, chunksBlockedUntil - now + 100));
    }
    route.continue().catch(() => {});
  });

  await setThemeCookie(context, 'light');

  await page.goto(`${BASE_URL}/en`, { waitUntil: 'domcontentloaded' });
  const isDarkBeforeChunks2 = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  );
  expect(isDarkBeforeChunks2).toBe(false);
});

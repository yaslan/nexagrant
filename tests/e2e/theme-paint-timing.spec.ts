import { test, expect } from '@playwright/test';

test('theme initialization runs during HTML parsing, before chunk JS loads', async ({ page }) => {
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
  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'dark');
  });

  // Navigate and wait for dom content loaded (HTML parsed)
  // Chunks are still blocked at this point
  await page.goto('http://localhost:3000/tr', {
    waitUntil: 'domcontentloaded'
  });

  // Measure: is dark class present BEFORE chunks load?
  // If theme-init.js ran at parse time, dark class should exist
  // If only ThemeProvider (useEffect) applies it, dark class won't exist
  const isDarkBeforeChunks = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });

  expect(isDarkBeforeChunks).toBe(true);
});

test('theme applies immediately on both locales before chunks load', async ({ page }) => {
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

  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'dark');
  });

  await page.goto('http://localhost:3000/tr', { waitUntil: 'domcontentloaded' });
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

  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'light');
  });

  await page.goto('http://localhost:3000/en', { waitUntil: 'domcontentloaded' });
  const isDarkBeforeChunks2 = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  );
  expect(isDarkBeforeChunks2).toBe(false);
});

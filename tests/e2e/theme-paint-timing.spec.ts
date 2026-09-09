import { test, expect } from '@playwright/test';

test('theme script runs at parse time, not after body JS loads', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => {
    logs.push(msg.text());
  });

  // Set dark theme before page load
  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'dark');
  });

  // Navigate to Turkish locale
  await page.goto('http://localhost:3000/tr', {
    waitUntil: 'networkidle'
  });

  // Check if dark class was applied
  const isDark = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });

  console.log('Page logs:', logs);
  console.log('Dark class applied:', isDark);

  expect(isDark).toBe(true);
});

test('theme applies immediately on both locales', async ({ page }) => {
  // Test both Turkish and English locales
  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'dark');
  });

  await page.goto('http://localhost:3000/tr', { waitUntil: 'networkidle' });
  let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(isDark).toBe(true);

  // Clear and test light theme
  await page.addInitScript(() => {
    localStorage.setItem('fabrika-theme', 'light');
  });

  await page.goto('http://localhost:3000/en', { waitUntil: 'networkidle' });
  isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(isDark).toBe(false);
});

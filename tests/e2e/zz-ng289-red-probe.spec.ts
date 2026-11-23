import { test, expect } from '@playwright/test';

// NG-289 Ö1 probe: DELIBERATELY FAILING. Lives only on ng289-red-probe. Never merge.
test('NG-289 red probe: artifact upload check', async ({ page }) => {
  await page.setContent('<h1>probe</h1>');
  expect(1, 'deliberate failure for the artifact check').toBe(2);
});

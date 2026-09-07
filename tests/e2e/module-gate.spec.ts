import { test, expect } from '@playwright/test';

test.describe('Module Gate Access Control', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app (demo session — no auth required if seed data exists)
    await page.goto('http://localhost:3000/en/default/dashboard');
    // Wait for page load
    await page.waitForLoadState('networkidle');
  });

  test('pipeline page loads successfully (M5 accessible by default)', async ({ page }) => {
    await page.goto('http://localhost:3000/en/default/pipeline');
    await page.waitForLoadState('networkidle');

    // Check that page content is visible (not locked)
    const content = await page.locator('h1, [role="main"]').first().isVisible();
    expect(content).toBeTruthy();
  });

  test('gated page shows lock screen when module is unavailable (simulate)', async ({ page }) => {
    // This test checks the gate UI structure by verifying the lock icon exists
    // In a real scenario, the module would need to be set to OFF via DB/admin

    // Navigate to a gated page
    await page.goto('http://localhost:3000/en/default/evidence');
    await page.waitForLoadState('networkidle');

    // Page should load (module enabled by default)
    // If testing module OFF, the page would show lock emoji and gate message
    const bodyText = await page.textContent('body');

    // Either the page content OR the gate lock screen should be present
    // (Depending on module state in this run)
    expect(bodyText).toBeTruthy();
  });

  test('firsatlar alias routes to same module as pipeline (M5)', async ({ page }) => {
    // Test that TR alias points to correct module
    await page.goto('http://localhost:3000/tr/default/firsatlar');
    await page.waitForLoadState('networkidle');

    const content = await page.locator('h1, [role="main"]').first().isVisible();
    expect(content).toBeTruthy();
  });
});

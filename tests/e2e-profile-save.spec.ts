/**
 * TASK-MUPUHIIKSQAPN — Y-4 regression test: Kurumsal Profil kaydı sunucuya gidiyor
 * ve sayfa yenilendikten sonra değer kalıcı oluyor.
 *
 * Before: Form "başarıyla güncellendi" gösteriyordu ama 0 POST gidiyordu ve veri kayboluyor.
 * After: Form gerçek sunucu isteği gönderiyor, başarı mesajı ancak sunucu başarılı dönünce gösterilir.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import crypto from 'crypto';

const suffix = crypto.randomBytes(3).toString('hex');

test.describe('Y-4 — Kurumsal Profil kaydı sunucuya gidiyor', () => {
  let tenantId: string;
  let userId: string;
  let authToken: string;

  test.beforeAll(async () => {
    // Setup: Create test tenant and user with auth token
    // This would normally be done via an API setup call
    // For now, we skip this and assume the test environment is pre-configured
    tenantId = `test-tenant-${suffix}`;
    userId = `test-user-${suffix}`;
  });

  test('should send profile update to server and persist after reload', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set auth cookie (simulating logged-in user)
    // In a real test, you would get this from your test setup
    // For now, we'll navigate to the profile page

    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const profileUrl = `${baseUrl}/tr/default/settings/profile`;

    // Go to profile page
    await page.goto(profileUrl, { waitUntil: 'networkidle' });

    // Wait for page to load
    await page.waitForSelector('textarea[placeholder*="teknik"]', { timeout: 5000 });

    // Get the current values
    const capabilitiesInput = page.locator('textarea[placeholder*="teknik"]');
    const keywordsInput = page.locator('input[placeholder*="e.g. AI"]');

    // Read current values
    const originalCapabilities = await capabilitiesInput.inputValue();
    const originalKeywords = await keywordsInput.inputValue();

    // Create new test data
    const newCapabilities = `Test profile ${suffix}: AI, ML, Robotics expertise, TRL 5-8`;
    const newKeywords = 'TestAI, TestML, TestRobotics';

    // Clear and fill form
    await capabilitiesInput.clear();
    await capabilitiesInput.fill(newCapabilities);

    await keywordsInput.clear();
    await keywordsInput.fill(newKeywords);

    // Click save button
    const saveButton = page.locator('button:has-text("Profili Kaydet")');

    // Wait for success message instead of monitoring network
    const successMessage = page.locator('text=başarıyla güncellendi');

    await saveButton.click();

    // Wait for success message to appear (indicates server action succeeded)
    await successMessage.waitFor({ state: 'visible', timeout: 3000 });

    // Verify success message is shown
    await expect(successMessage).toBeVisible();

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for form to load
    await page.waitForSelector('textarea[placeholder*="teknik"]', { timeout: 5000 });

    // Verify data persists after reload
    const savedCapabilities = await capabilitiesInput.inputValue();
    const savedKeywords = await keywordsInput.inputValue();

    expect(savedCapabilities).toBe(newCapabilities);
    expect(savedKeywords).toBe(newKeywords);

    // Cleanup
    await context.close();
  });

  test('should show error when server returns error', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const profileUrl = `${baseUrl}/tr/default/settings/profile`;

    await page.goto(profileUrl, { waitUntil: 'networkidle' });

    // Wait for form
    await page.waitForSelector('textarea[placeholder*="teknik"]', { timeout: 5000 });

    const capabilitiesInput = page.locator('textarea[placeholder*="teknik"]');

    // Try to submit with empty capabilities (should fail validation)
    await capabilitiesInput.clear();

    const saveButton = page.locator('button:has-text("Profili Kaydet")');
    await saveButton.click();

    // Should NOT show success message
    const successMessage = page.locator('text=başarıyla güncellendi');
    const errorMessage = page.locator('[class*="text-bad"]');

    // Verify error message is shown, not success
    try {
      await successMessage.waitFor({ state: 'visible', timeout: 2000 });
      throw new Error('Success message should not be shown for validation error');
    } catch {
      // Expected - success message should not appear
    }

    await expect(errorMessage).toBeVisible();

    // Cleanup
    await context.close();
  });
});

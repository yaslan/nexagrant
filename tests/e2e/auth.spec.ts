import { test, expect } from '@playwright/test';

test.describe('Authentication and Tenant Provisioning', () => {
  test('should allow user to navigate to register page and see options', async ({ page }) => {
    // 1. Navigate to register
    await page.goto('/tr/register');
    
    // 2. Verify page loaded correctly
    await expect(page.locator('h1')).toContainText('Sign In or Register');
    
    // 3. Verify OAuth options exist
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Microsoft')).toBeVisible();
  });

  // Note: Full E2E for OAuth requires mocking the provider or using a specialized
  // library like @playwright-testing-library/auth or similar test users in Google/MS.
  // Below is a structural test of the auth endpoint.
  test('should redirect to auth provider on click', async ({ page }) => {
    await page.goto('/tr/register');
    
    // We catch the navigation to prevent actually leaving localhost in the test if desired,
    // or we verify the redirect URL.
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('accounts.google.com') || req.url().includes('/api/auth/signin')),
      page.click('text=Continue with Google')
    ]);

    expect(request.url()).toContain('/api/auth/signin');
  });
});

import { test, expect } from '@playwright/test';

/**
 * These assertions were written against an English sign-in screen that the app no longer
 * renders, and they had never run: there was no playwright.config.ts, so `pnpm test:e2e`
 * collected nothing and reported "0 tests in 0 files". They now assert the copy the
 * Turkish route actually serves, with the same coverage as before — heading plus both
 * OAuth providers.
 */
test.describe('Authentication and Tenant Provisioning', () => {
  test.beforeEach(async ({ page }) => {
    // The cookie consent renders as a full-screen `inset-0` alertdialog and intercepts
    // pointer events across the page, including the OAuth buttons.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
  });

  test('should allow user to navigate to register page and see options', async ({ page }) => {
    // 1. Navigate to register
    await page.goto('/tr/register');

    // 2. Verify page loaded correctly
    await expect(page.locator('h1')).toContainText('Ücretsiz Çalışma Alanı Açın');

    // 3. Verify OAuth options exist
    await expect(page.getByRole('button', { name: /Google ile Devam Et/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Microsoft Kurumsal ile Giriş/ })).toBeVisible();
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
      page.getByRole('button', { name: /Google ile Devam Et/ }).click(),
    ]);

    // The click may be observed either at our own sign-in endpoint or already at
    // Google's authorize URL, depending on how fast NextAuth redirects; both mean the
    // provider flow started, which is what this test is checking.
    expect(request.url()).toMatch(/\/api\/auth\/signin|accounts\.google\.com/);
  });
});

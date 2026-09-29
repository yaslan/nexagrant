import { test, expect } from '@playwright/test';

import { expectHydrated, trackInflight } from './fixtures/hydration';

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
    // ADR-0006 (owner decision 29.09): Google is the only OAuth provider.
    await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0);
  });

  // Note: Full E2E for OAuth requires mocking the provider or using a specialized
  // library like @playwright-testing-library/auth or similar test users in Google/MS.
  // Below is a structural test of the auth endpoint.
  test('should redirect to auth provider on click', async ({ page }) => {
    const inflight = trackInflight(page);
    await page.goto('/tr/register');
    // While the page streams, Next holds a second, `hidden` copy of this form,
    // so a bare getByTestId can hit strict mode; the locators below take the
    // visible copy. What has to be true before the tick and the click is that
    // React has attached their handlers (fixtures/hydration.ts says why that is
    // no longer a network-idle wait).
    const google = page.getByRole('button', { name: /Google ile Devam Et/ });
    await expectHydrated(google, inflight);

    // TASK-MTSWLANXSU0IG — on the REGISTER tab, the OAuth buttons now go through
    // the same disclosure step as the e-mail form. An OAuth sign-up creates the
    // account inside the provider callback, where the form no longer exists, so
    // the acknowledgement has to be taken before the redirect starts or there is
    // nothing left to take it from. Ticking the box is now part of "clicking
    // Google" on this page, and the test says so rather than working around it.
    await page.locator('form').filter({ visible: true }).getByTestId('disclosure-ack').check();

    // We catch the navigation to prevent actually leaving localhost in the test if desired,
    // or we verify the redirect URL.
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('accounts.google.com') || req.url().includes('/api/auth/signin')),
      google.click(),
    ]);

    // The click may be observed either at our own sign-in endpoint or already at
    // Google's authorize URL, depending on how fast NextAuth redirects; both mean the
    // provider flow started, which is what this test is checking.
    expect(request.url()).toMatch(/\/api\/auth\/signin|accounts\.google\.com/);
  });

  test('the provider flow does not start until the disclosure is acknowledged', async ({ page }) => {
    // The other half of the rule above: without the tick, clicking Google must
    // not begin an OAuth sign-up at all.
    const inflight = trackInflight(page);
    await page.goto('/tr/register');
    // Hydrated first: a click that lands before React does starts nothing
    // either, and would pass this test without the rule being in force.
    const google = page.getByRole('button', { name: /Google ile Devam Et/ });
    await expectHydrated(google, inflight);
    await expect(
      page.locator('form').filter({ visible: true }).getByTestId('disclosure-ack')
    ).not.toBeChecked();

    let startedProviderFlow = false;
    page.on('request', (req) => {
      if (req.url().includes('accounts.google.com') || req.url().includes('/api/auth/signin')) {
        startedProviderFlow = true;
      }
    });

    await google.click();
    await expect(page.getByText(/onaylamanız gerekir/i)).toBeVisible();
    expect(startedProviderFlow, 'an unacknowledged click started an OAuth sign-up').toBe(false);
  });
});

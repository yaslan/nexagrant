import { test, expect, type Page } from '@playwright/test';

import { expectHydrated } from './fixtures/hydration';
import { seedIdentity, cleanupIdentity } from './fixtures/session';

/**
 * NG-5 (FE-0.5), card item 3 — sign in through the real form, land in the main layout.
 *
 * Every other signed-in spec mints its session with `signInAs` and never touches the sign-in
 * screen; the a11y scan (a11y-aa.spec.ts) does the same. This one types an address into the
 * form, presses the button and follows the redirect to the panel, so the path a person takes
 * (form → credentials → callbackUrl → main layout) is exercised once end to end.
 *
 * The e-mail form exists only while DEMO_LOGIN_ENABLED is on, which a production build
 * (`next start`) refuses to boot with; as in registration-consent.spec.ts the spec is skipped
 * there. The seat is the spec's own and is removed again afterwards.
 */

const SEAT = {
  userId: 'e2e-login-form-owner',
  email: 'login-form-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

test.skip(
  process.env.E2E_WEB_SERVER === 'start',
  'the e-mail sign-in form exists only with DEMO_LOGIN_ENABLED, which next start refuses',
);

test.beforeAll(async () => {
  await seedIdentity({ ...SEAT, workspaceIds: [] });
});
test.afterAll(async () => {
  await cleanupIdentity([SEAT.userId]);
});

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

const CASES = [
  { locale: 'tr', login: '/tr/giris', panel: '/tr/main/panel', submit: /E-posta ile Giriş Yap/ },
  { locale: 'en', login: '/en/login', panel: '/en/main/dashboard', submit: /Sign In with Email/ },
] as const;

for (const c of CASES) {
  test(`${c.locale}: the sign-in form leads to the main layout`, async ({ page }) => {
    await acceptCookies(page);
    await page.goto(`${c.login}?callbackUrl=${encodeURIComponent(c.panel)}`);

    const email = page.locator('form input[type="email"]:visible');
    // Typing before React has attached its handlers would be lost; wait for hydration first.
    await expectHydrated(email);
    await email.fill(SEAT.email);
    await page.getByRole('button', { name: c.submit }).click();
    await page.waitForURL(`**${c.panel}`, { timeout: 45_000 });

    // Main layout: the panel's overview is there and the sign-in form is gone.
    await expect(page.locator('#dashboard-panel-overview')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
}

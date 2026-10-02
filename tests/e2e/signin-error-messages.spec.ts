import { test, expect, type Page } from '@playwright/test';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { shotsDir } from './fixtures/shots';

/**
 * İNCELEME-14 K-3 (TASK-MUMAC1VT7DT5Q) — Auth.js's own sign-in errors reach the
 * sign-in page as `?error=<type>` (pages.signIn in src/lib/auth.ts), but
 * AuthCard only turned our three signIn-callback codes into a message, so
 * OAuthAccountNotLinked, OAuthCallbackError and anything else left the visitor
 * on a silent login card after a failed sign-in.
 *
 * Each case is asserted on the served page, not on the component in isolation:
 * the message is the one in messages/{tr,en}.json, the raw code never appears,
 * and the alert can be dismissed with a real click.
 */

const SHOTS = shotsDir('TASK-MUMAC1VT7DT5Q-screenshots');

const tr = trMessages.Auth.signInError;
const en = enMessages.Auth.signInError;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

const alert = (page: Page) => page.getByRole('alert').filter({ visible: true });

test.describe('sign-in error messages', () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  test('OAuthAccountNotLinked shows its own message', async ({ page }) => {
    await page.goto('/tr/giris?error=OAuthAccountNotLinked');
    await expect(alert(page)).toContainText(tr.OAuthAccountNotLinked);
    await expect(page.getByText('OAuthAccountNotLinked')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/01-oauth-account-not-linked-tr.png`, fullPage: true });
  });

  test('OAuthCallbackError shows the generic message and can be dismissed', async ({ page }) => {
    await page.goto('/tr/giris?error=OAuthCallbackError');
    await expect(alert(page)).toContainText(tr.generic);
    await page.screenshot({ path: `${SHOTS}/02-oauth-callback-error-tr.png`, fullPage: true });

    // The close button uses aria-label for accessibility; look for it by button type + aria-label
    const closeButton = alert(page).locator('button');
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    await expect(alert(page)).toHaveCount(0);
  });

  test('an unknown code shows the generic message, never the code itself', async ({ page }) => {
    const crafted = 'Hesabiniz_askiya_alindi_0850';
    await page.goto(`/en/login?error=${crafted}`);
    await expect(alert(page)).toContainText(en.generic);
    await expect(page.getByText(crafted)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/03-unknown-code-en.png`, fullPage: true });
  });

  test('our own signIn-callback codes keep their messages', async ({ page }) => {
    await page.goto('/tr/giris?error=invite_invalid');
    await expect(alert(page)).toContainText(tr.invite_invalid);
  });

  test('no error parameter, no alert', async ({ page }) => {
    await page.goto('/tr/giris', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
  });
});

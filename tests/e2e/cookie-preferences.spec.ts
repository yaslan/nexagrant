import { test, expect, type Page } from '@playwright/test';

/**
 * FO-180 — the cookie answer can be changed, and withdrawn, as easily as it was
 * given (KVKK / ePrivacy). A "Cookie preferences" link in the public footer and
 * in the cookie section of /privacy reopens the banner; "Essential Only" then
 * withdraws analytics consent and removes what analytics stored in the browser.
 *
 * Analytics stores one thing, the anonymous id in localStorage
 * (src/lib/analytics.ts); it sets no cookie. The id is seeded here because the
 * e2e server runs without a PostHog key, so nothing would mint it.
 */

const CONSENT = 'fabrika_cookie_consent';
const ANON_ID = 'fabrika_analytics_anon_id';

const COPY = {
  tr: { home: '/tr', privacy: '/tr/gizlilik-politikasi', accept: 'Tümünü Kabul Et', essential: 'Gerekli Çerezler', link: 'Çerez tercihleri', current: 'Şu anki seçiminiz: tüm çerezler kabul edildi' },
  en: { home: '/en', privacy: '/en/privacy', accept: 'Accept All', essential: 'Essential Only', link: 'Cookie preferences', current: 'Your current choice: all cookies accepted' },
} as const;

const banner = (page: Page) => page.getByRole('alertdialog');
const stored = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key);
/** FO-183: where keyboard focus is — inside the banner, or the page behind it. */
const focusInBanner = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
  });

for (const locale of ['tr', 'en'] as const) {
  const c = COPY[locale];

  test.describe(`cookie preferences (${locale})`, () => {
    test('accept, reopen from the footer, withdraw: analytics data is gone', async ({ page, context }) => {
      await page.goto(c.home);
      await expect(banner(page)).toBeVisible();
      await banner(page).getByRole('button', { name: c.accept }).click();
      await expect(banner(page)).toBeHidden();
      expect(JSON.parse((await stored(page, CONSENT)) ?? '{}').accepted).toBe(true);
      await page.evaluate((k) => window.localStorage.setItem(k, 'seeded-anon-id'), ANON_ID);

      const link = page.getByTestId('public-footer').getByRole('button', { name: c.link });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(banner(page)).toBeVisible();
      await expect(page.getByTestId('cookie-current-choice')).toContainText(c.current);
      await expect(banner(page).getByRole('button', { name: c.essential })).toBeFocused();

      await banner(page).getByRole('button', { name: c.essential }).click();
      await expect(banner(page)).toBeHidden();
      await expect(link).toBeFocused();
      expect(JSON.parse((await stored(page, CONSENT)) ?? '{}')).toMatchObject({ accepted: false, level: 'essential' });
      expect(await stored(page, ANON_ID)).toBeNull();
      expect((await context.cookies()).filter((cookie) => /^ph_|posthog/i.test(cookie.name))).toEqual([]);

      // The answer sticks: a reload does not ask again.
      await page.reload();
      await expect(page.getByTestId('public-footer')).toBeVisible();
      await expect(banner(page)).toBeHidden();
    });

    test('the /privacy cookie section reopens the banner; Escape leaves the answer as it was', async ({ page }) => {
      await page.goto(c.privacy);
      await banner(page).getByRole('button', { name: c.essential }).click();
      await expect(banner(page)).toBeHidden();

      const link = page.getByRole('main').getByRole('button', { name: c.link });
      await link.click();
      await expect(banner(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(banner(page)).toBeHidden();
      await expect(link).toBeFocused();
      expect(JSON.parse((await stored(page, CONSENT)) ?? '{}').accepted).toBe(false);

      // Changing the answer the other way works from here too.
      await link.click();
      await banner(page).getByRole('button', { name: c.accept }).click();
      await expect(banner(page)).toBeHidden();
      expect(JSON.parse((await stored(page, CONSENT)) ?? '{}').accepted).toBe(true);
    });
    test('FO-183: Tab and Shift+Tab stay in the reopened banner; Escape returns focus to the link', async ({ page }) => {
      await page.goto(c.privacy);
      await banner(page).getByRole('button', { name: c.accept }).click();
      await expect(banner(page)).toBeHidden();

      const link = page.getByRole('main').getByRole('button', { name: c.link });
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(banner(page)).toBeVisible();
      await expect(banner(page).getByRole('button', { name: c.essential })).toBeFocused();

      // Three controls (privacy link, Essential, Accept): eight presses each way go round twice.
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        expect(await focusInBanner(page), `Tab #${i + 1}`).toBe(true);
      }
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Shift+Tab');
        expect(await focusInBanner(page), `Shift+Tab #${i + 1}`).toBe(true);
      }
      // The cycle wraps: from the last control, Tab goes to the first.
      await banner(page).getByRole('button', { name: c.accept }).focus();
      await page.keyboard.press('Tab');
      await expect(banner(page).getByRole('link')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(banner(page)).toBeHidden();
      await expect(link).toBeFocused();
      expect(JSON.parse((await stored(page, CONSENT)) ?? '{}').accepted).toBe(true);
    });

    test('FO-183: first visit — focus starts in the banner, Tab stays there, Escape does not skip the answer', async ({ page }) => {
      await page.goto(c.home);
      await expect(banner(page)).toBeVisible();
      await expect(banner(page).getByRole('button', { name: c.essential })).toBeFocused();
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab');
        expect(await focusInBanner(page), `Tab #${i + 1}`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(banner(page)).toBeVisible();
      expect(await stored(page, CONSENT)).toBeNull();
      await banner(page).getByRole('button', { name: c.essential }).click();
      await expect(banner(page)).toBeHidden();
    });
  });
}

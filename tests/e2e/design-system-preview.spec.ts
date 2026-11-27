import { expect, test, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { expectHydrated } from './fixtures/hydration';

/**
 * NG-2 — the shared primitives on /admin/design-system, driven with real clicks and keys.
 * What jsdom cannot show lives here: the native dialog's focus trap and Escape, the theme switch,
 * and whether a narrow screen scrolls sideways.
 */

const COOKIE_NAME = 'authjs.session-token';

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  const value = await encode({
    token: {
      sub: 'demo-user-superadmin',
      id: 'demo-user-superadmin',
      name: 'Platform Admin',
      email: 'admin@yasinaslan.com.tr',
      tenantId: 'demo-tenant',
      role: 'SUPER_ADMIN',
      isPlatformAdmin: true,
    },
    secret: e2eAuthSecret(),
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }));
  });
}

test.describe('design system preview', () => {
  test('a guest gets a 404, not the page', async ({ page }) => {
    const response = await page.goto('/tr/admin/design-system');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('design-system-preview')).toHaveCount(0);
  });

  test.describe('as a platform admin', () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await signInAsPlatformAdmin(page, baseURL as string);
      await page.goto('/tr/admin/design-system');
      // Hydrated, not only painted: the server-rendered buttons are visible before React attaches
      // their handlers, and a click in that gap is lost (NG-121: the modal never opened, pagination
      // stopped at "2 / 3"). Measured on dev: 9 of 10 clicks landed before hydration.
      await expectHydrated(page.getByTestId('design-system-preview'));
    });

    test('shows every component in the brief', async ({ page }) => {
      for (const id of ['buttons', 'inputs', 'cards', 'table', 'chips', 'badges', 'status', 'modal', 'tabs', 'pagination']) {
        await expect(page.getByTestId(`ds-${id}`)).toBeVisible();
      }
    });

    test('the modal traps focus, closes on Escape and returns focus to its opener', async ({ page }) => {
      const opener = page.getByRole('button', { name: 'Modalı aç' });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Örnek modal' });
      await expect(dialog).toBeVisible();

      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await dialog.evaluate((node) => node.contains(document.activeElement) || document.activeElement === document.body);
        expect(inside).toBe(true);
      }

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();

      await opener.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).click();
      await expect(dialog).toBeHidden();

      // A closed-by-Escape dialog has to open again: `open` must not stay stuck on true.
      await opener.click();
      await expect(dialog).toBeVisible();
    });

    test('tabs follow the arrow keys', async ({ page }) => {
      const section = page.getByTestId('ds-tabs');
      await section.getByRole('tab', { name: 'Genel' }).click();
      await page.keyboard.press('ArrowRight');
      await expect(section.getByRole('tab', { name: 'Belgeler' })).toBeFocused();
      await expect(section.getByRole('tabpanel')).toContainText('Belgeler sekmesinin');
      await page.keyboard.press('End');
      await expect(section.getByRole('tabpanel')).toContainText('Geçmiş sekmesinin');
    });

    test('pagination stops at the last page and keeps focus there', async ({ page }) => {
      const section = page.getByTestId('ds-pagination');
      const next = section.getByRole('button', { name: 'Sonraki' });
      await next.click();
      await next.click();
      await expect(section).toContainText('3 / 3');
      await expect(next).toHaveAttribute('aria-disabled', 'true');
      await expect(next).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(section).toContainText('3 / 3');
    });

    test('chips toggle and can be removed', async ({ page }) => {
      const section = page.getByTestId('ds-chips');
      const toggle = section.getByRole('button', { name: 'Seçilebilir' });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await section.getByRole('button', { name: 'Kaldırılabilir filtresini kaldır' }).click();
      await expect(section.getByText('Kaldırılabilir')).toHaveCount(0);
    });

    test('the theme switch recolours the page', async ({ page }) => {
      // The painted colour: the bundler is free to rewrite how the token itself is spelled.
      const card = page.getByTestId('ds-cards').locator('.rounded-2xl').first();
      const background = () => card.evaluate((node) => getComputedStyle(node).backgroundColor);
      const header = page.getByTestId('design-system-preview').locator('header');
      await header.getByRole('button', { name: 'Koyu Mod' }).click();
      await expect.poll(background).toBe('rgb(11, 19, 36)');
      await header.getByRole('button', { name: 'Açık Mod' }).click();
      await expect.poll(background).toBe('rgb(255, 255, 255)');
    });

    for (const width of [375, 768, 1280]) {
      test(`does not scroll sideways at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/tr/admin/design-system');
        await expect(page.getByTestId('design-system-preview')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
});

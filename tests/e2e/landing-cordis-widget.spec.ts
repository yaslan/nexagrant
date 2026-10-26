import { test, expect } from '@playwright/test';

/**
 * FO-169 — the landing page's CORDIS block: "Horizon Europe projects with
 * participants from Türkiye", CORDIS's own widget with a link to the same search
 * when the widget cannot show.
 *
 * Nothing here depends on CORDIS being up: every request to cordis.europa.eu is
 * aborted, so the block must fall back to the link. Which path gets there depends
 * on the server's NEXT_PUBLIC_CORDIS_WIDGET_KEY — unset (CI), the link is there
 * from the first render; set, the loader script fails and the widget hands over to
 * the link. Run with a placeholder key to exercise the second:
 * `NEXT_PUBLIC_CORDIS_WIDGET_KEY=placeholder pnpm test:e2e tests/e2e/landing-cordis-widget.spec.ts`.
 */

const HEADINGS = {
  tr: "Türkiye'nin yer aldığı güncel Horizon Europe projeleri",
  en: 'Current Horizon Europe projects with participants from Türkiye',
} as const;

const LINKS = {
  tr: "Türkiye katılımcılı Horizon Europe projelerini CORDIS'te aç",
  en: 'Open Horizon Europe projects with participants from Türkiye on CORDIS',
} as const;

test.describe('landing page CORDIS projects block (FO-169)', () => {
  test.beforeEach(async ({ page }) => {
    // The cookie banner is a full-screen alertdialog that swallows clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });
    await page.route('https://cordis.europa.eu/**', (route) => route.abort());
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale}: heading shows and, with CORDIS unreachable, the fallback link does too`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const section = page.locator('#cordis-projects');
      await expect(section.getByRole('heading', { level: 2, name: HEADINGS[locale] })).toBeVisible();

      const box = page.getByTestId('cordis-projects');
      const heightBefore = (await box.boundingBox())!.height;

      // The widget gets CORDIS_WIDGET_TIMEOUT_MS (8 s) before it gives up.
      const link = section.getByRole('link', { name: LINKS[locale] });
      await expect(link).toBeVisible({ timeout: 15_000 });
      await expect(box).toHaveAttribute('data-status', 'fallback');

      const href = new URL((await link.getAttribute('href'))!);
      expect(href.origin + href.pathname).toBe('https://cordis.europa.eu/search');
      expect(href.searchParams.get('q')).toBe(
        "contenttype='project' AND frameworkProgramme='HORIZON' AND relatedRegion/region/euCode=='TR'"
      );
      expect(href.searchParams.get('srt')).toBe('/project/contentUpdateDate:decreasing');

      // Same box, same height: the link replaces the loading line without a jump.
      expect((await box.boundingBox())!.height).toBe(heightBefore);
    });
  }

  test('390px: the block stays inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tr');
    const box = page.getByTestId('cordis-projects');
    await box.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('cordis-projects-fallback')).toBeVisible({ timeout: 15_000 });
    const rect = (await box.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows).toBe(false);
  });
});

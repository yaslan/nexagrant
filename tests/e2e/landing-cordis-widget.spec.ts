import { test, expect } from '@playwright/test';
import { CORDIS_IFRAME_SANDBOX } from '../../src/lib/cordis-widget';

/**
 * FO-169 — the landing page's CORDIS block: "Horizon Europe projects with
 * participants from Türkiye", CORDIS's own widget with a link to the same search
 * when the widget cannot show.
 *
 * Nothing here depends on CORDIS being up: every request to cordis.europa.eu is
 * aborted, so the block must fall back to the link. Which path gets there depends
 * on the server's NEXT_PUBLIC_CORDIS_WIDGET_KEY — unset (CI), there is no frame and
 * the link is there from the first render; set, the home page frames
 * /<locale>/embed/cordis in a sandboxed iframe (K-573263), the loader fails inside
 * it and the link replaces the frame. The runner reads the same .env as the
 * server, so the keyed tests run only when a key is set; run them with
 * `NEXT_PUBLIC_CORDIS_WIDGET_KEY=placeholder pnpm test:e2e tests/e2e/landing-cordis-widget.spec.ts`.
 */

const HAS_KEY = Boolean(process.env.NEXT_PUBLIC_CORDIS_WIDGET_KEY?.trim());

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
        JSON.stringify({ necessary: true, analytics: false, marketing: false, time: new Date().toISOString(), version: 'draft-2026-11-18' })
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

  test('embed opened on its own: 404, and the document is sandboxed (no origin of ours)', async ({ page }) => {
    // Sec-Fetch-Dest: document — the route refuses; without a key it would be a 404 too,
    // so the sandbox header is what this test is for: it must be on the 404 as well.
    const res = await page.goto('/en/embed/cordis');
    expect(res!.status()).toBe(404);
    expect(res!.headers()['content-security-policy'] ?? '').toContain(`sandbox ${CORDIS_IFRAME_SANDBOX}`);
    expect(await page.evaluate(() => window.origin)).toBe('null');
  });

  // FO-169 Y-1: the router decodes the path, so these reach the embed route too.
  test('percent-encoded embed paths: when the widget answers (200), the enforced policy sandboxes it', async ({ request }) => {
    for (const path of ['/tr/embed/%63ordis', '/%74r/embed/cordis']) {
      const res = await request.get(path, { headers: { 'Sec-Fetch-Dest': 'iframe' }, maxRedirects: 0 });
      expect(new URL(res.url()).pathname, path).toBe(path);
      const policy = res.headers()['content-security-policy'] ?? '';
      if (res.status() === 200) expect(await res.text(), path).toContain('cordis-widget-loader');
      else expect(res.status(), path).toBe(404); // no key on this server
      expect(policy, path).toContain(`sandbox ${CORDIS_IFRAME_SANDBOX}`);
      expect(policy, path).toContain("frame-ancestors 'self'");
    }
  });

  test('no key: no frame at all, and the embed route is a 404', async ({ page, request }) => {
    test.skip(HAS_KEY, 'the server has a widget key');
    await page.goto('/en');
    await expect(page.getByTestId('cordis-projects-fallback')).toBeVisible();
    await expect(page.getByTestId('cordis-projects-frame')).toHaveCount(0);
    expect((await request.get('/en/embed/cordis')).status()).toBe(404);
  });

  test('with a key: the widget runs in a sandboxed frame without allow-same-origin', async ({ page, request }) => {
    test.skip(!HAS_KEY, 'needs NEXT_PUBLIC_CORDIS_WIDGET_KEY on the server');
    // CORDIS stays unreachable: the frame shows up first, then the link replaces it.
    await page.goto('/en');
    const frame = page.getByTestId('cordis-projects-frame');
    await expect(frame).toHaveAttribute('src', '/en/embed/cordis');
    const sandbox = (await frame.getAttribute('sandbox')) ?? '';
    expect(sandbox.split(/\s+/).sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox', 'allow-scripts']);
    expect(sandbox).not.toContain('allow-same-origin');

    // The home page names no CORDIS source and frames only itself; the embed may be framed by us only.
    const home = await request.get('/en');
    const homeCsp = home.headers()['content-security-policy'] ?? '';
    expect(homeCsp).not.toMatch(/cordis/i);
    expect(homeCsp).toMatch(/frame-src 'self'/);
    // a top-level visit (Sec-Fetch-Dest: document) gets no widget page; the frame's own request gets it
    expect((await request.get('/en/embed/cordis', { headers: { 'Sec-Fetch-Dest': 'document' } })).status()).toBe(404);
    const embed = await request.get('/en/embed/cordis', { headers: { 'Sec-Fetch-Dest': 'iframe' } });
    expect(embed.status()).toBe(200);
    expect(embed.headers()['content-security-policy']).toMatch(/frame-ancestors 'self'/);
    expect(embed.headers()['content-security-policy']).toContain('https://cordis.europa.eu/datalab/visualisations/');

    await expect(page.getByTestId('cordis-projects-fallback')).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveCount(0);
  });

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

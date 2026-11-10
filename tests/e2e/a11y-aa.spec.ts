import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * NG-5 (FE-0.5) — WCAG 2.x A/AA automatic scan as part of `pnpm test:e2e`, hence of `pnpm gate`.
 *
 * `pnpm a11y:check` (Lighthouse) measures a score by hand, outside the gate. This spec fails the
 * gate on any A/AA violation axe finds on the first pages a user meets: the public home, the
 * sign-in screen, and — signed in — the main app layout. Locales tr and en.
 *
 * Not loosened: `scan` disables nothing and no call passes a rule list. If a page fails, the page
 * is fixed. (The KPI card links once needed label-content-name-mismatch off; their accessible name
 * is now the visible text plus the action hint, so WCAG 2.5.3 is checked like every other rule.)
 * The last test proves the scanner is live: it injects a button with no name and expects axe
 * to report it, so a scan that silently finds nothing cannot pass for a clean page.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const OWNER = {
  userId: 'e2e-a11y-owner',
  email: 'a11y-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

/**
 * Waits until React has hydrated `main`. Until then the page is server HTML only; a node injected
 * into that HTML makes hydration fail, and React rebuilds the tree from scratch, removing the node.
 * `main` is visible before hydration, so visibility alone does not prove the injection will survive.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => Object.keys(document.querySelector('main') ?? {}).some((k) => k.startsWith('__reactFiber')),
    null,
    { timeout: 60_000 },
  );
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
}

/**
 * Redirect-proof check (NG-90 review). A redirect to sign-in or no-workspace ends on a 200 page that has
 * a `main`, so status and `main` alone cannot tell it from the page under test. The browser must still
 * stand on the requested path, and that page's own `h1` must be visible.
 */
async function expectOwnPage(page: Page, path: string) {
  await expect.poll(() => new URL(page.url()).pathname, `${path} nihai adres`).toBe(path);
  await expect(page.locator('h1').first(), `${path} sayfa başlığı`).toBeVisible();
}

test.describe('WCAG A/AA — public pages', () => {
  for (const url of ['/tr', '/en', '/tr/giris', '/en/login']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      await page.goto(url);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), url).toEqual([]);
    });
  }
});

test.describe('WCAG A/AA — signed in, main layout', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...OWNER, workspaceIds: [] });
  });
  test.afterAll(async () => {
    await cleanupIdentity([OWNER.userId]);
  });

  for (const url of ['/tr/main/panel', '/en/main/dashboard']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
      await page.goto(url);
      await expect(page.locator('#dashboard-panel-overview')).toBeVisible({ timeout: 30_000 });
      expect(await scan(page), url).toEqual([]);
    });
  }
});

/**
 * NG-90 — genişletme. Yalnız KEŞİFTE (ham axe) ihlalsiz ve 200 dönen adresler buraya girer.
 * Eklenmeyenler (ihlalli, ayrı borç kartında raporlanır): /tr/fiyatlandirma, /en/pricing (color-contrast),
 * /tr/kayit, /en/register (color-contrast), /tr/main/ayarlar (color-contrast), /tr/main/firsatlar ve
 * /en/main/pipeline (color-contrast; select-name NG-102 ile kapandı, kontrast kartı kapanınca eklenecek).
 * /tr/main/ayarlar/uyeler ve /en/main/settings/members NG-102 ile (select-name düzeltildi) eklendi.
 * Hiçbir axe kuralı kapatılmadı, hiçbir bölüm exclude edilmedi.
 */
test.describe('WCAG A/AA — NG-90 public pages (tr + en)', () => {
  for (const url of ['/tr/blog', '/en/blog', '/tr/gizlilik-politikasi', '/en/privacy', '/tr/kullanim-kosullari', '/en/terms']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expectOwnPage(page, url);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), url).toEqual([]);
    });
  }

  for (const locale of ['tr', 'en']) {
    test(`/${locale}/blog/<ilk yazı> has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      await page.goto(`/${locale}/blog`);
      // Post links only, inside <main>: the header menu and category labels are not candidates.
      const link = page.locator(`main a[href^="/${locale}/blog/"]`).first();
      await expect(link, 'blog listesinde yazı bağlantısı (main içinde)').toBeVisible();
      const href = await link.getAttribute('href');
      expect(href, 'bağlantı yazı sayfasına gidiyor').toMatch(new RegExp(`^/${locale}/blog/[^/?#]+$`));
      const response = await page.goto(href!);
      expect(response?.status(), href!).toBe(200);
      await expectOwnPage(page, href!);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), href!).toEqual([]);
    });
  }
});

test.describe('WCAG A/AA — NG-90 signed in, settings (tr + en)', () => {
  // Own user, so this describe's seed/cleanup does not share a userId with the panel describe above (review bulgu 3).
  const SETTINGS_OWNER = { ...OWNER, userId: 'e2e-a11y-settings-owner', email: 'a11y-settings-owner@e2e.fabrika.test' };
  test.beforeAll(async () => {
    await seedIdentity({ ...SETTINGS_OWNER, workspaceIds: [] });
  });
  test.afterAll(async () => {
    await cleanupIdentity([SETTINGS_OWNER.userId]);
  });

  for (const url of ['/tr/main/ayarlar/profil', '/tr/main/ayarlar/gizlilik', '/en/main/settings/profile', '/en/main/settings/privacy', '/tr/main/ayarlar/uyeler', '/en/main/settings/members']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      await signInAs(page, { id: SETTINGS_OWNER.userId, email: SETTINGS_OWNER.email, tenantId: SETTINGS_OWNER.tenantId, role: SETTINGS_OWNER.role });
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expectOwnPage(page, url);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), url).toEqual([]);
    });
  }
});

test('the scanner is live: a nameless button is reported', async ({ page }) => {
  await acceptCookies(page);
  await page.goto('/tr/giris');
  await expect(page.locator('main')).toBeVisible();
  await waitForHydration(page);
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'a11y-selftest';
    document.querySelector('main')!.appendChild(b);
  });
  const found = await scan(page);
  expect(found.map((v) => v.rule)).toContain('button-name');
});

test('label-content-name-mismatch (WCAG 2.5.3) is live: a link whose name drops its visible text is reported', async ({ page }) => {
  await acceptCookies(page);
  await page.goto('/tr/giris');
  await expect(page.locator('main')).toBeVisible();
  await waitForHydration(page);
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.id = 'a11y-selftest-label';
    a.href = '/tr';
    a.setAttribute('aria-label', 'Ayrıntıya git');
    a.textContent = 'Toplam Teklif 5 proje';
    document.querySelector('main')!.appendChild(a);
  });
  const found = await scan(page);
  expect(found.map((v) => v.rule)).toContain('label-content-name-mismatch');
});

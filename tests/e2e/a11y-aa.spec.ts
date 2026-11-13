import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
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
 * NG-146 — hesaplanmış renk kontrastı (axe'in kapsamadığı rozetler için).
 *
 * Neden: axe-core 4.14 (`@axe-core/playwright` 4.14.0'ın bağımladığı sürüm) `bg-emerald-500/15` ve
 * `bg-amber-500/15` rozetlerini (lab()/oklab() metin, yarı saydam arka plan) ne ihlal ne incomplete ne
 * passes listesine koyar: sessizce atlar. `bg-accent/15` ve `bg-purple-500/15` ise ölçülür. Sürüm
 * yükseltmesi bunu değiştirmez (4.13 ve 4.14 ikisinde de OKLab desteği var), bu yüzden renk tarayıcıdan
 * okunup WCAG oranı burada hesaplanır: getComputedStyle → canvas ile sRGB → atalar boyunca alfa bileşimi.
 *
 * Sınır: gradyan arka plan ölçülemez; sessizce geçmek yerine hata verir. Ata `opacity` değerleri
 * yalnız öğenin kendi opacity'si hesaba katılır (bu rozetlerde ata opacity yok).
 */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas 2d bağlamı yok');
    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    // Atalar boyunca, köküten öğeye doğru bileşimle arka plan (kök varsayılan beyaz).
    const layers: [number, number, number, number][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== 'none') {
        throw new Error(`gradyan arka plan ölçülemez: <${node.tagName.toLowerCase()} class="${node.className}">`);
      }
      const bg = toRgba(cs.backgroundColor);
      if (bg[3] > 0) layers.unshift(bg);
    }
    let base: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of layers) {
      base = [a * r + (1 - a) * base[0], a * g + (1 - a) * base[1], a * b + (1 - a) * base[2]];
    }
    const cs = getComputedStyle(el);
    const [fr, fg, fb, fa] = toRgba(cs.color);
    const alpha = fa * Number(cs.opacity);
    const text: [number, number, number] = [alpha * fr + (1 - alpha) * base[0], alpha * fg + (1 - alpha) * base[1], alpha * fb + (1 - alpha) * base[2]];
    const linear = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: [number, number, number]) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
    const l1 = luminance(text);
    const l2 = luminance(base);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
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
 * NG-101 ile renk kontrastı düzeltildi (gerçek renk, kural kapatılmadı): /tr/fiyatlandirma, /en/pricing,
 * /tr/kayit, /en/register, /tr/main/ayarlar. /tr/main/ayarlar/uyeler ve /en/main/settings/members NG-102 ile
 * (select-name düzeltildi) eklendi. Hiçbir axe kuralı kapatılmadı, hiçbir bölüm exclude edilmedi.
 */
test.describe('WCAG A/AA — NG-90 public pages (tr + en)', () => {
  for (const url of ['/tr/blog', '/en/blog', '/tr/gizlilik-politikasi', '/en/privacy', '/tr/kullanim-kosullari', '/en/terms', '/tr/fiyatlandirma', '/en/pricing', '/tr/kayit', '/en/register']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expectOwnPage(page, url);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), url).toEqual([]);
    });
  }

  // NG-121: posts are Turkish only — /en/blog lists none (its notice page is scanned
  // above) and /en/blog/<slug> redirects to /tr/blog/<slug>, so only TR has a post page.
  for (const locale of ['tr']) {
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

test.describe('WCAG A/AA — NG-101 signed in, pipeline (tr + en)', () => {
  // Kontrast düzeltildi (NG-101): kart kapsamlı taramada da 0 ihlal; tam A/AA tarama temiz.
  const PIPELINE_OWNER = { ...OWNER, userId: 'e2e-a11y-pipeline-owner', email: 'a11y-pipeline-owner@e2e.fabrika.test' };
  test.beforeAll(async () => {
    await seedIdentity({ ...PIPELINE_OWNER, workspaceIds: [] });
  });
  test.afterAll(async () => {
    await cleanupIdentity([PIPELINE_OWNER.userId]);
  });

  for (const url of ['/tr/main/ayarlar', '/tr/main/firsatlar', '/en/main/pipeline']) {
    test(`${url} has no A/AA violations`, async ({ page }) => {
      await acceptCookies(page);
      await signInAs(page, { id: PIPELINE_OWNER.userId, email: PIPELINE_OWNER.email, tenantId: PIPELINE_OWNER.tenantId, role: PIPELINE_OWNER.role });
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expectOwnPage(page, url);
      await expect(page.locator('main')).toBeVisible();
      expect(await scan(page), url).toEqual([]);
    });
  }
});

/**
 * NG-119 — TTO portföy rozeti (`text-purple-*` kontrastı). Rozet yalnız portföyde en az bir kayıt varsa
 * render edilir (tto/client.tsx: items.map içinde); demo tenant'ta kayıt olmadığı için eski tarama bu
 * rozeti hiç görmüyordu. Burada kendi tenant'ımızda bir kayıt tohumlanır ve sayfa dolu hâlinde taranır.
 * Hiçbir axe kuralı kapatılmaz.
 */
test.describe('WCAG A/AA — NG-119 signed in, TTO portfolio with an item (tr)', () => {
  const TTO_TENANT = 'e2e-a11y-tto-tenant';
  const TTO_OWNER = { ...OWNER, userId: 'e2e-a11y-tto-owner', email: 'a11y-tto-owner@e2e.fabrika.test', tenantId: TTO_TENANT };
  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.a11y.tto.setup', async (tx) => {
      await tx.tenant.upsert({
        where: { id: TTO_TENANT },
        create: { id: TTO_TENANT, name: 'A11y TTO e2e', slug: TTO_TENANT, country: 'TR', orgType: 'SME' },
        update: {},
      });
      await tx.subscription.upsert({
        where: { tenantId: TTO_TENANT },
        create: { tenantId: TTO_TENANT, planId: 'ultra', status: 'ACTIVE' },
        update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
      });
    });
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TTO_TENANT, moduleId: 'M7' } },
      create: { tenantId: TTO_TENANT, moduleId: 'M7', status: 'ON' },
      update: { status: 'ON' },
    });
    await seedIdentity({ ...TTO_OWNER, workspaceIds: [] }, { id: 'e2e-a11y-tto-ws', slug: 'main', name: 'Main' });
    await prisma.ttoPortfolioItem.deleteMany({ where: { tenantId: TTO_TENANT } });
    // Üç patent durumunun üçü de tohumlanır: granted (yeşil), pending (amber), licensed (accent).
    // Her rozet yalnız kendi durumunun kaydı varken render edilir (tto/client.tsx getPatentBadge).
    for (const [title, patentStatus] of [
      ['A11y TTO kayıt', 'granted'],
      ['A11y TTO bekleyen kayıt', 'pending'],
      ['A11y TTO lisanslı kayıt', 'licensed'],
    ] as const) {
      await prisma.ttoPortfolioItem.create({
        data: {
          tenantId: TTO_TENANT,
          title,
          trl: 5,
          patentStatus,
          summary: 'Kontrast taraması için tohumlanmış portföy kaydı.',
          keywords: ['a11y'],
        },
      });
    }
  });
  test.afterAll(async () => {
    await prisma.ttoPortfolioItem.deleteMany({ where: { tenantId: TTO_TENANT } });
    await cleanupIdentity([TTO_OWNER.userId]);
    await withSystemScope('platform-admin', 'e2e.a11y.tto.teardown', (tx) =>
      tx.tenant.deleteMany({ where: { id: TTO_TENANT } }),
    );
  });

  test('/tr/main/tto (portföy dolu) has no A/AA violations', async ({ page }) => {
    await acceptCookies(page);
    await signInAs(page, { id: TTO_OWNER.userId, email: TTO_OWNER.email, tenantId: TTO_OWNER.tenantId, role: TTO_OWNER.role });
    const response = await page.goto('/tr/main/tto');
    expect(response?.status(), '/tr/main/tto').toBe(200);
    await expectOwnPage(page, '/tr/main/tto');
    await expect(page.getByRole('heading', { name: 'A11y TTO kayıt' }), 'granted rozetinin kaydı görünür').toBeVisible();
    await expect(page.getByRole('heading', { name: 'A11y TTO bekleyen kayıt' }), 'pending rozetinin kaydı görünür').toBeVisible();
    await expect(page.getByRole('heading', { name: 'A11y TTO lisanslı kayıt' }), 'licensed rozetinin kaydı görünür').toBeVisible();
    expect(await scan(page), '/tr/main/tto').toEqual([]);
  });

  test('/tr/main/tto rozetleri hesaplanmış renkle AA; yol haritası ve kontrol listesi taranır (NG-146)', async ({ page }) => {
    await acceptCookies(page);
    await signInAs(page, { id: TTO_OWNER.userId, email: TTO_OWNER.email, tenantId: TTO_OWNER.tenantId, role: TTO_OWNER.role });
    const response = await page.goto('/tr/main/tto');
    expect(response?.status(), '/tr/main/tto').toBe(200);
    await expectOwnPage(page, '/tr/main/tto');

    // axe bu iki rozeti hiçbir listeye koymaz; oranı burada ölçüyoruz.
    for (const label of ['Tescilli (Granted)', 'Başvuru Aşamasında (Pending)', 'Lisanslandı (Licensed)']) {
      const badge = page.locator('span').getByText(label, { exact: true });
      await expect(badge, `${label} rozeti görünür`).toBeVisible();
      expect(await contrastRatio(badge), `${label} kontrast oranı`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await scan(page), 'portföy').toEqual([]);

    await page.getByRole('button', { name: 'TRL Seviye Haritası (TRL 1-9)' }).click();
    for (const label of ['TRL 1 - 3 (Temel Araştırma)', 'TRL 4 - 6 (Prototip & Doğrulama)', 'TRL 7 - 9 (Ticarileşme & Pazar)']) {
      const badge = page.locator('span').getByText(label, { exact: true });
      await expect(badge, `${label} rozeti görünür`).toBeVisible();
      expect(await contrastRatio(badge), `${label} kontrast oranı`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await scan(page), 'yol haritası').toEqual([]);

    await page.getByRole('button', { name: 'IP & Lisanslama Kontrol Listesi' }).click();
    expect(await scan(page), 'kontrol listesi').toEqual([]);
  });
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

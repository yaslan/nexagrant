import { readFileSync, mkdirSync } from 'node:fs';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MUU73C419M0YH (crw2-fb rerun) — independent QA of the blog system on
 * fe-fb/blog-image-upload, steps a–h. QA harness only, not committed.
 * Own tenant + own users + own posts; afterAll deletes only those. demo-tenant untouched.
 */

const FX = process.env.QA_FIXTURES as string;
const SHOTS = process.env.QA_SHOTS as string;
const PNG = readFileSync(`${FX}/kapak.png`);
const JPG = readFileSync(`${FX}/kapak2.jpg`);
const BIG = readFileSync(`${FX}/buyuk-6mb.png`);
const TXT = readFileSync(`${FX}/notlar.txt`);
const FAKE = readFileSync(`${FX}/sahte.png`);

const BASE = Math.random().toString(36).slice(2, 7);
const TENANT = `qa-crw2-blog-${BASE}`;
const ADMIN = { userId: `qa-crw2-blog-admin-${BASE}`, email: `qa-crw2-blog-admin-${BASE}@e2e.fabrika.test` };
const MEMBER = { userId: `qa-crw2-blog-member-${BASE}`, email: `qa-crw2-blog-member-${BASE}@e2e.fabrika.test` };

const MSG = {
  type: 'Bu dosya türü desteklenmiyor. JPG, PNG veya WebP bir görsel seçin.',
  size: "Görsel 5 MB'tan büyük. Daha küçük bir dosya seçin.",
  slug: 'Bu kısa adla (slug) bir yazı zaten var. Başlığı ya da kısa adı değiştirin.',
  saved: 'Blog yazısı kaydedildi.',
};

const state: Record<number, { title: string; slug: string; url1?: string; url2?: string; title2?: string }> = {};
const created: string[] = [];
function s(info: TestInfo) {
  const i = info.repeatEachIndex;
  if (!state[i]) {
    const run = `${BASE}${i}`;
    state[i] = { title: `QA kapak testi ${run}`, slug: `qa-kapak-testi-${run}` };
    created.push(state[i].slug);
  }
  return state[i];
}
const shot = (info: TestInfo, page: Page, name: string, fullPage = true) =>
  info.repeatEachIndex === 0 ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }) : Promise.resolve(Buffer.alloc(0));

async function asAdmin(page: Page, baseURL: string) {
  await page.route('https://images.unsplash.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: TENANT, role: 'TENANT_OWNER' }, baseURL);
}

async function decoded(img: ReturnType<Page['locator']>) {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const res = page.waitForResponse((r) => r.url().endsWith('/api/admin/blog/image') && r.request().method() === 'POST');
  await page.getByTestId('blog-image-input').setInputFiles(file);
  return res;
}

async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(m.sw, `scrollWidth ${m.sw} > clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw);
}

test.describe.serial('QA blog a–h', () => {
  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    await withSystemScope('platform-admin', 'qa.crw2.seed', (tx) =>
      tx.tenant.create({ data: { id: TENANT, name: `QA crw2 blog ${BASE}`, slug: TENANT, country: 'TR' } })
    );
    await seedIdentity({ ...ADMIN, role: 'TENANT_OWNER', tenantId: TENANT, workspaceIds: [], isPlatformAdmin: true });
    await seedIdentity({ ...MEMBER, role: 'TENANT_OWNER', tenantId: TENANT, workspaceIds: [], isPlatformAdmin: false });
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: `qa-kapak-testi-${BASE}` } } });
    await cleanupIdentity([ADMIN.userId, MEMBER.userId]);
    await withSystemScope('platform-admin', 'qa.crw2.cleanup', async (tx) => {
      await tx.workspace.deleteMany({ where: { tenantId: TENANT } });
      await tx.auditEvent.deleteMany({ where: { tenantId: TENANT } }).catch(() => undefined);
      await tx.tenant.deleteMany({ where: { id: TENANT } });
    });
    await prisma.$disconnect();
  });

  test('a) new post + real PNG upload → preview → save → row + public object', async ({ page, baseURL, playwright }, info) => {
    const st = s(info);
    await asAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByTestId('blog-new').click();
    await page.getByLabel('Makale Başlığı *').fill(st.title);
    await page.getByLabel('Kategori *').fill('QA');
    await page.getByLabel('Özet (Excerpt) *').fill('Bağımsız QA koşusunun kısa özeti.');
    await page.getByLabel('Makale İçeriği (Markdown) *').fill('# QA\n\nKapak gerçek PNG ile yüklendi.');
    const res = await upload(page, { name: 'kapak.png', mimeType: 'image/png', buffer: PNG });
    expect(res.status()).toBe(200);
    st.url1 = ((await res.json()) as { url: string }).url;
    expect(st.url1).toMatch(/^http:\/\/localhost:9107\/test-public\/blog\/\d{4}\/c[0-9a-z]{24}\.png$/);
    await expect(page.getByTestId('blog-image-preview')).toHaveAttribute('src', st.url1);
    await decoded(page.getByTestId('blog-image-preview'));
    await shot(info, page, 'a1-preview');
    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText(MSG.saved);
    await shot(info, page, 'a2-saved-list');
    const row = await prisma.blogPost.findUnique({ where: { slug: st.slug } });
    expect(row?.image).toBe(st.url1);
    const anon = await playwright.request.newContext();
    const obj = await anon.get(st.url1);
    expect(obj.status()).toBe(200);
    expect(obj.headers()['content-type']).toBe('image/png');
    expect(Buffer.from(await obj.body()).equals(PNG)).toBe(true);
    await anon.dispose();
  });

  test('b) /tr/blog list + post page + og:image', async ({ page }, info) => {
    const st = s(info);
    const list = await page.goto('/tr/blog');
    expect(list?.status()).toBe(200);
    const card = page.locator('a, article').filter({ hasText: st.title }).first();
    await card.scrollIntoViewIfNeeded();
    await decoded(card.locator('img').first());
    await shot(info, page, 'b1-tr-blog-list');
    const post = await page.goto(`/tr/blog/${st.slug}`);
    expect(post?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(st.title);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(og).toBe(st.url1);
    await decoded(page.locator('main img').first());
    await shot(info, page, 'b2-tr-post');
  });

  test('c) edit title + replace cover with JPEG', async ({ page, baseURL, playwright }, info) => {
    const st = s(info);
    st.title2 = `${st.title} düzenlendi`;
    await asAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByRole('row').filter({ hasText: st.slug }).getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByTestId('blog-image-preview')).toHaveAttribute('src', st.url1 as string);
    await page.getByLabel('Makale Başlığı *').fill(st.title2);
    const res = await upload(page, { name: 'kapak2.jpg', mimeType: 'image/jpeg', buffer: JPG });
    expect(res.status()).toBe(200);
    st.url2 = ((await res.json()) as { url: string }).url;
    expect(st.url2).toMatch(/\/blog\/\d{4}\/c[0-9a-z]{24}\.jpg$/);
    await decoded(page.getByTestId('blog-image-preview'));
    await shot(info, page, 'c1-edit-preview');
    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText(MSG.saved);
    const row = await prisma.blogPost.findUnique({ where: { slug: st.slug } });
    expect(row?.title).toBe(st.title2);
    expect(row?.image).toBe(st.url2);
    await page.goto(`/tr/blog/${st.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(st.title2);
    expect(await page.locator('meta[property="og:image"]').first().getAttribute('content')).toBe(st.url2);
    await decoded(page.locator('main img').first());
    await shot(info, page, 'c2-edited-post');
    // Old object: recorded, not asserted as pass/fail of the product (orphan check).
    const anon = await playwright.request.newContext();
    const old = await anon.get(st.url1 as string);
    info.annotations.push({ type: 'old-cover-after-replace', description: `GET ${st.url1} → ${old.status()}` });
    console.log(`[QA] old cover after replace: ${old.status()}`);
    await anon.dispose();
  });

  test('d) same title again → slug conflict message, no second row', async ({ page, baseURL }, info) => {
    const st = s(info);
    await asAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByTestId('blog-new').click();
    await page.getByLabel('Makale Başlığı *').fill(st.title);
    await page.getByLabel('Kategori *').fill('QA');
    await page.getByLabel('Özet (Excerpt) *').fill('Aynı başlıkla ikinci yazı denemesi.');
    await page.getByLabel('Makale İçeriği (Markdown) *').fill('Aynı başlıkla ikinci yazı: slug çakışması testi.');
    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-form-error').or(page.getByTestId('blog-error'))).toHaveText(MSG.slug);
    // Probe (no assert): is the refusal inside the visible part of the scrolled modal?
    const vis = await page.getByTestId('blog-form-error').evaluate((el) => {
      const r = el.getBoundingClientRect();
      let p: HTMLElement | null = el.parentElement;
      while (p && !(p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY !== 'visible')) p = p.parentElement;
      const c = p ? p.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      return { errTop: Math.round(r.top), errBottom: Math.round(r.bottom), boxTop: Math.round(c.top), boxBottom: Math.round(c.bottom), scrollTop: p?.scrollTop ?? -1 };
    });
    console.log(`[QA] slug error position ${JSON.stringify(vis)} inView=${vis.errBottom > vis.boxTop && vis.errTop < vis.boxBottom}`);
    await shot(info, page, 'd1-slug-conflict');
    expect(await prisma.blogPost.count({ where: { slug: st.slug } })).toBe(1);
    expect((await prisma.blogPost.findUnique({ where: { slug: st.slug } }))?.title).toBe(st.title2);
  });

  test('e) invalid files: .txt, 6 MB PNG, fake .png (UI) + server-side size/type', async ({ page, baseURL }, info) => {
    await asAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByTestId('blog-new').click();
    let posted = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/admin/blog/image')) posted++;
    });
    const input = page.getByTestId('blog-image-input');
    await input.setInputFiles({ name: 'notlar.txt', mimeType: 'text/plain', buffer: TXT });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG.type);
    await shot(info, page, 'e1-txt');
    await input.setInputFiles({ name: 'buyuk-6mb.png', mimeType: 'image/png', buffer: BIG });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG.size);
    await shot(info, page, 'e2-6mb');
    expect(posted).toBe(0);
    const res = await upload(page, { name: 'sahte.png', mimeType: 'image/png', buffer: FAKE });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'type' });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG.type);
    await shot(info, page, 'e3-fake-png');

    // Server side, bypassing the client check (same admin cookie).
    const big = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'buyuk.png', mimeType: 'image/png', buffer: BIG } },
    });
    expect(big.status()).toBe(400);
    expect(await big.json()).toEqual({ error: 'size' });
    const txt = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: TXT } },
    });
    expect(txt.status()).toBe(400);
    expect(await txt.json()).toEqual({ error: 'type' });
    const svg = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') } },
    });
    expect(svg.status()).toBe(400);
  });

  test('g) /en/blog + post at 390px: no horizontal scroll; admin modal at 390px', async ({ page, baseURL }, info) => {
    const st = s(info);
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.goto('/en/blog'))?.status()).toBe(200);
    await noHorizontalScroll(page);
    await shot(info, page, 'g1-en-blog-390');
    expect((await page.goto(`/en/blog/${st.slug}`))?.status()).toBe(200);
    await decoded(page.locator('main img').first());
    await noHorizontalScroll(page);
    await shot(info, page, 'g2-en-post-390');
    expect((await page.goto(`/tr/blog/${st.slug}`))?.status()).toBe(200);
    await noHorizontalScroll(page);
    await asAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByTestId('blog-new').click();
    await noHorizontalScroll(page);
    await shot(info, page, 'g3-admin-modal-390', false);
  });

  test('f) delete → gone from admin + list, post page 404', async ({ page, baseURL }, info) => {
    const st = s(info);
    await asAdmin(page, baseURL as string);
    page.on('dialog', (d) => void d.accept());
    await page.goto('/tr/admin/blog');
    await page.getByTestId(`blog-delete-${st.slug}`).click();
    await expect(page.getByRole('row').filter({ hasText: st.slug })).toHaveCount(0);
    await shot(info, page, 'f1-after-delete');
    expect(await prisma.blogPost.count({ where: { slug: st.slug } })).toBe(0);
    await page.goto('/tr/blog');
    await expect(page.getByText(st.title2 as string)).toHaveCount(0);
    const gone = await page.goto(`/tr/blog/${st.slug}`);
    expect(gone?.status()).toBe(404);
    await shot(info, page, 'f2-post-404');
  });

  test('h) non-admin: /tr/admin/blog 404, upload 403; anonymous upload 401', async ({ page, baseURL, playwright }, info) => {
    await signInAs(page, { id: MEMBER.userId, email: MEMBER.email, tenantId: TENANT, role: 'TENANT_OWNER' }, baseURL as string);
    const admin = await page.goto('/tr/admin/blog');
    expect(admin?.status()).toBe(404);
    await shot(info, page, 'h1-member-admin-404');
    const up = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'kapak.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(up.status()).toBe(403);
    expect(await up.json()).toEqual({ error: 'forbidden' });
    const anon = await playwright.request.newContext({ baseURL });
    const a = await anon.post('/api/admin/blog/image', {
      multipart: { file: { name: 'kapak.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(a.status()).toBe(401);
    await anon.dispose();
  });
});

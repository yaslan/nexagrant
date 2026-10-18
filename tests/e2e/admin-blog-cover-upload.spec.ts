import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { blogContentEditor } from './fixtures/rich-editor';

/**
 * TASK-MUU20XFIXZKTE — the admin blog form uploads its cover image.
 *
 * The URL box is gone: the editor picks a file, it goes to
 * `POST /api/admin/blog/image` (TASK-MUU20NSV2TETW), the returned URL is
 * previewed and saved as `BlogPost.image`. Driven by real clicks and a real
 * PNG through `setInputFiles`; the upload lands in a real S3-compatible store
 * (the CI job's MinIO) and the saved row is read back from Postgres by this
 * process, the image URL by a cookieless client.
 *
 * The upload tests need R2_* plus R2_PUBLIC_BUCKET / R2_PUBLIC_HOST in the e2e
 * environment (ci.yml "E2E Test"). Outside CI without them they skip; in CI a
 * missing store fails them. The 503 and the legacy-URL tests need no store.
 */

const SHOTS = shotsDir('TASK-MUU20XFIXZKTE-blog-cover-upload');
const RUN = Math.random().toString(36).slice(2, 8);
const TITLE = `E2E kapak yükleme ${RUN}`;
const SLUG = `e2e-kapak-yukleme-${RUN}`;
const LEGACY_SLUG = `e2e-kapak-eski-url-${RUN}`;
const LEGACY_IMAGE = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80';

const storeConfigured = Boolean(
  process.env.R2_ACCOUNT_ID && process.env.R2_PUBLIC_BUCKET && process.env.R2_PUBLIC_HOST
);

const ADMIN = {
  userId: 'e2e-blog-cover-admin',
  email: 'blog-cover-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

const MSG_TYPE = 'Bu dosya türü desteklenmiyor. JPG, PNG veya WebP bir görsel seçin.';
const MSG_UNCONFIGURED = 'Dosya deposu yapılandırılmamış; görsel şu an yüklenemiyor. Sistem yöneticisine bildirin.';

/** A real RGB PNG of `w`×`h` pixels, a two-colour gradient — no fixture file needed. */
function makePng(w: number, h: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x * 3] = Math.round((255 * x) / w);
      raw[row + 2 + x * 3] = 90;
      raw[row + 3 + x * 3] = Math.round((255 * y) / h);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PNG = makePng(320, 200);

async function openNewPost(page: Page, baseURL: string): Promise<void> {
  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL);
  await page.goto('/tr/admin/blog');
  await page.getByTestId('blog-new').click();
}

/** Resolves once the <img> has decoded real pixels (a broken image stays at 0). */
async function expectImageDecoded(page: Page, selector: ReturnType<Page['locator']>): Promise<void> {
  await expect(selector).toBeVisible();
  await expect
    .poll(() => selector.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test.describe.serial('admin blog — cover image is uploaded, not typed', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { in: [SLUG, LEGACY_SLUG] } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('real PNG → preview → save → BlogPost.image is the returned URL → it shows on /tr/blog', async ({
    page,
    baseURL,
    playwright,
  }) => {
    test.skip(!storeConfigured && !process.env.CI, 'no public object store in this environment (R2_PUBLIC_*)');
    expect(storeConfigured, 'CI must run this against the MinIO public bucket').toBe(true);

    await openNewPost(page, baseURL as string);
    await page.getByLabel('Makale Başlığı *').fill(TITLE);
    await page.getByLabel('Kategori *').fill('E2E');
    await page.getByLabel('Özet (Excerpt) *').fill('Kapak görseli yükleme testinin kısa özeti.');
    await blogContentEditor(page).click();
    await page.keyboard.insertText('Bu yazının kapağı uçtan uca testte yüklendi.');

    const uploaded = page.waitForResponse(
      (r) => r.url().endsWith('/api/admin/blog/image') && r.request().method() === 'POST'
    );
    // A new post starts with no cover (TASK-MVDPA19QP3M9A): the picker says "choose".
    await expect(page.getByTestId('blog-image-preview')).toHaveCount(0);
    await page.getByLabel('Görsel seç').setInputFiles({ name: 'kapak.png', mimeType: 'image/png', buffer: PNG });
    const res = await uploaded;
    expect(res.status()).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https?:\/\/.+\/blog\/.+\.png$/);

    const preview = page.getByTestId('blog-image-preview');
    await expect(preview).toHaveAttribute('src', url);
    await expectImageDecoded(page, preview);
    await expect(page.getByTestId('blog-image-error')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/01-preview.png`, fullPage: true });

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');

    // Read back over this process's own connection, not through the app.
    const row = await prisma.blogPost.findUnique({ where: { slug: SLUG } });
    expect(row?.image).toBe(url);

    // The stored object is public: a cookieless client reads the same bytes.
    const anon = await playwright.request.newContext();
    const obj = await anon.get(url);
    expect(obj.status()).toBe(200);
    expect(obj.headers()['content-type']).toBe('image/png');
    expect(Buffer.from(await obj.body()).equals(PNG)).toBe(true);
    await anon.dispose();

    await page.goto('/tr/blog');
    const card = page.locator('a, article').filter({ hasText: TITLE }).first();
    await card.scrollIntoViewIfNeeded();
    await expectImageDecoded(page, card.locator('img').first());
    await page.screenshot({ path: `${SHOTS}/02-public-blog.png`, fullPage: true });
  });

  test('a wrong file type is refused with a message, on the client and by the server', async ({ page, baseURL }) => {
    test.skip(!storeConfigured && !process.env.CI, 'no public object store in this environment (R2_PUBLIC_*)');
    expect(storeConfigured, 'CI must run this against the MinIO public bucket').toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await openNewPost(page, baseURL as string);
    // The new-post form starts with no cover; upload one so there is a cover to keep.
    const first = page.waitForResponse((r) => r.url().endsWith('/api/admin/blog/image'));
    await page.getByLabel('Görsel seç').setInputFiles({ name: 'kapak.png', mimeType: 'image/png', buffer: PNG });
    expect((await first).status()).toBe(200);
    const preview = page.getByTestId('blog-image-preview');
    await expect(preview).toHaveAttribute('src', /\/blog\/.+\.png$/);
    const before = await preview.getAttribute('src');
    const input = page.getByLabel('Görseli değiştir');

    // Declared as text: refused before anything is sent.
    let posted = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/admin/blog/image')) posted++;
    });
    await input.setInputFiles({ name: 'notlar.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG_TYPE);
    expect(posted).toBe(0);

    // Declared as PNG, bytes are not: the route sniffs them and answers 400 type.
    const refused = page.waitForResponse((r) => r.url().endsWith('/api/admin/blog/image'));
    await input.setInputFiles({ name: 'sahte.png', mimeType: 'image/png', buffer: Buffer.from('definitely not a png') });
    const res = await refused;
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'type' });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG_TYPE);

    // The form still holds the image it had, and still shows it.
    await expect(page.getByTestId('blog-image-preview')).toHaveAttribute('src', before as string);
    await expectImageDecoded(page, page.getByTestId('blog-image-preview'));
    await page.getByTestId('blog-image-error').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-wrong-type-390.png` });
  });

  test('no object store (503) → the "not configured" message, no alert()', async ({ page, baseURL }) => {
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    // The 503 branch cannot be reached on a server that has a store; the
    // route's own answer for it is fixed by the contract and tested by BE.
    await page.route('**/api/admin/blog/image', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'object_store_unconfigured' }) })
    );
    await openNewPost(page, baseURL as string);
    // The picker is in the tab order (the input is visually hidden, not removed).
    await page.locator('#featured').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('blog-image-input')).toBeFocused();
    // …and the focus is visible: the label draws a ring around the hidden input.
    const picker = page.locator('label[for="blog-image-file"]');
    // Tailwind writes transparent shadows when no ring is on; a ring has a 2px spread.
    await expect(picker).toHaveCSS('box-shadow', /0px 0px 0px 2px/);
    const box = await picker.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${SHOTS}/04a-keyboard-focus.png`,
        clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
      });
    }
    await page.getByLabel('Görsel seç').setInputFiles({ name: 'kapak.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('blog-image-error')).toHaveText(MSG_UNCONFIGURED);
    await expect(page.getByTestId('blog-image-uploading')).toHaveCount(0);
    await expect(page.getByTestId('blog-submit')).toBeEnabled();
    expect(dialogs).toBe(0);
    // A new post had no cover, and a failed upload does not invent one.
    await expect(page.getByTestId('blog-image-preview')).toHaveCount(0);
    await expect(page.getByLabel('Görsel seç')).toBeAttached();
    await page.screenshot({ path: `${SHOTS}/04-unconfigured.png`, fullPage: true });
  });

  test('a post saved with an unsplash URL still previews it and keeps it on save', async ({ page, baseURL }) => {
    // The CDN is not this test's subject; answer for it so CI needs no internet.
    await page.route('https://images.unsplash.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    );
    await prisma.blogPost.create({
      data: {
        slug: LEGACY_SLUG,
        title: `E2E eski kapak ${RUN}`,
        excerpt: 'Elle girilmiş unsplash adresli eski bir yazı.',
        content: 'Bu yazının kapağı yükleme özelliğinden önce adresle girildi.',
        category: 'E2E',
        readMinutes: 1,
        publishedAt: new Date(),
        image: LEGACY_IMAGE,
      },
    });

    await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL as string);
    await page.goto('/tr/admin/blog');
    await page.getByRole('row').filter({ hasText: LEGACY_SLUG }).getByRole('button', { name: 'Düzenle' }).click();

    const preview = page.getByTestId('blog-image-preview');
    await expect(preview).toHaveAttribute('src', LEGACY_IMAGE);
    await expectImageDecoded(page, preview);
    await page.screenshot({ path: `${SHOTS}/05-legacy-url.png`, fullPage: true });

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');
    expect((await prisma.blogPost.findUnique({ where: { slug: LEGACY_SLUG } }))?.image).toBe(LEGACY_IMAGE);
  });
});

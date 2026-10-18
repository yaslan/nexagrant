import { test, expect, type Page, type Route } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { blogContentEditor, pasteInto } from './fixtures/rich-editor';
import { makePng } from './fixtures/png';

/**
 * TASK-MVDPHZQCTVJ2R — links and images inside a blog post. Real clicks on the
 * editor's Link and Image tools: an outside link and a link on this site, an
 * uploaded image with its alt text → save → the row holds that markdown →
 * reload, the editor shows the same → the public page renders the outside
 * link in a new tab with `noopener noreferrer nofollow`, the site link in
 * place and the image from the public bucket.
 *
 * The save path refuses a forbidden link or an outside image even when the
 * editor is bypassed: the save request itself is rewritten on its way out.
 */

const SHOTS = shotsDir('TASK-MVDPHZQCTVJ2R-blog-links-images');
const RUN = Math.random().toString(36).slice(2, 8);
const SLUG = `e2e-link-gorsel-${RUN}`;
const RAW_SLUG = `e2e-link-ham-${RUN}`;
const ORIGINAL = 'Bu yazı bağlantı ve görsel testinden önce vardı ve düz bir paragraftır.';
const COVER = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80';

const storeConfigured = Boolean(
  process.env.R2_ACCOUNT_ID && process.env.R2_PUBLIC_BUCKET && process.env.R2_PUBLIC_HOST
);

const ADMIN = {
  userId: 'e2e-blog-links-admin',
  email: 'blog-links-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function openEdit(page: Page, slug: string): Promise<void> {
  await page.getByRole('row').filter({ hasText: slug }).getByRole('button', { name: 'Düzenle' }).click();
  await expect(blogContentEditor(page)).toBeVisible();
}

/** The caret after the last character of the editor's last paragraph (see admin-blog-rich-editor.spec.ts). */
async function caretAtEnd(page: Page): Promise<void> {
  const editor = blogContentEditor(page);
  await editor.click();
  await expect(editor).toBeFocused();
  const last = editor.locator('p').last();
  const box = await last.boundingBox();
  await last.click({ position: { x: (box?.width ?? 2) - 2, y: (box?.height ?? 2) / 2 } });
  await expect
    .poll(() => page.evaluate(() => { const s = getSelection(); return s?.isCollapsed && s.focusOffset === s.focusNode?.textContent?.length; }))
    .toBe(true);
}

/** Link tool with nothing selected: the text to show and the address. */
async function addLink(page: Page, text: string, url: string): Promise<void> {
  await page.getByRole('toolbar', { name: 'Biçimlendirme' }).getByRole('button', { name: 'Bağlantı' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bağlantı ekle' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Görünen metin').fill(text);
  await dialog.getByLabel('Adres').fill(url);
  await dialog.getByRole('button', { name: 'Uygula' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(blogContentEditor(page)).toBeFocused();
}

test.describe.serial('admin blog — links and images in a post', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    for (const slug of [SLUG, RAW_SLUG]) {
      await prisma.blogPost.create({
        data: {
          slug,
          title: `E2E bağlantı ve görsel ${slug}`,
          excerpt: 'Blog yazısına bağlantı ve görsel ekleme testi.',
          content: ORIGINAL,
          category: 'E2E',
          readTime: '1 dk',
          publishedAt: new Date(),
          image: COVER,
        },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { in: [SLUG, RAW_SLUG] } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    // The CDN is not this test's subject; answer for it so CI needs no internet.
    await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204 }));
    await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL as string);
    await page.goto('/tr/admin/blog');
  });

  test('link and image tools → saved as markdown → reload → the site renders both', async ({ page }) => {
    test.skip(!storeConfigured && !process.env.CI, 'no public object store in this environment (R2_PUBLIC_*)');
    expect(storeConfigured, 'CI must run this against the MinIO public bucket').toBe(true);

    await openEdit(page, SLUG);
    const editor = blogContentEditor(page);
    const toolbar = page.getByRole('toolbar', { name: 'Biçimlendirme' });
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ayrıntı için ');
    await addLink(page, 'rehbere', 'https://ec.europa.eu/info');
    await page.keyboard.type(' ve ');
    await addLink(page, 'fiyatlar sayfasına', '/tr/fiyatlar');
    await page.keyboard.type(' bakın.');
    await expect(editor.locator('a')).toHaveText(['rehbere', 'fiyatlar sayfasına']);

    // A refused address: the dialog says why and inserts nothing.
    await toolbar.getByRole('button', { name: 'Bağlantı' }).click();
    const linkDialog = page.getByRole('dialog', { name: 'Bağlantı ekle' });
    await linkDialog.getByLabel('Görünen metin').fill('kötü');
    await linkDialog.getByLabel('Adres').fill('javascript:alert(1)');
    await linkDialog.getByRole('button', { name: 'Uygula' }).click();
    await expect(linkDialog.getByRole('alert')).toContainText('Bu adres kullanılamaz.');
    await expect(linkDialog.getByLabel('Adres')).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({ path: `${SHOTS}/01-link-refused.png` });
    await page.keyboard.press('Escape');
    await expect(linkDialog).toHaveCount(0);
    await expect(editor.locator('a')).toHaveCount(2);

    // Image: upload, then alt text — both required before anything is inserted.
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Görsel' }).click();
    const imageDialog = page.getByRole('dialog', { name: 'Görsel ekle' });
    await imageDialog.getByRole('button', { name: 'Uygula' }).click();
    await expect(imageDialog.getByRole('alert')).toContainText('Önce bir görsel yükleyin.');
    await imageDialog.getByTestId('rte-image-file').setInputFiles({ name: 'sema.png', mimeType: 'image/png', buffer: makePng(320, 200) });
    await expect(imageDialog.getByRole('img', { name: 'Yüklenen görselin önizlemesi' })).toBeVisible();
    await imageDialog.getByRole('button', { name: 'Uygula' }).click();
    await expect(imageDialog.getByRole('alert')).toContainText('Alternatif metin zorunlu.');
    await imageDialog.getByLabel('Alternatif metin *').fill('Fon akış şeması');
    await page.screenshot({ path: `${SHOTS}/02-image-dialog.png` });
    await imageDialog.getByRole('button', { name: 'Uygula' }).click();
    await expect(imageDialog).toHaveCount(0);
    await expect(editor.getByRole('img', { name: 'Fon akış şeması' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-editor-link-image.png` });

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');
    const content = (await prisma.blogPost.findUnique({ where: { slug: SLUG } }))?.content ?? '';
    const host = (process.env.R2_PUBLIC_HOST ?? '').replace(/\/+$/, '');
    const [, imageUrl = ''] = content.match(/!\[Fon akış şeması\]\(([^)]+)\)$/) ?? [];
    expect(imageUrl.startsWith(`${host}/blog/`)).toBe(true);
    expect(content).toBe(
      [
        ORIGINAL,
        'Ayrıntı için [rehbere](https://ec.europa.eu/info) ve [fiyatlar sayfasına](/tr/fiyatlar) bakın.',
        `![Fon akış şeması](${imageUrl})`,
      ].join('\n\n')
    );

    // Reload: the same links and image in the editor.
    await page.reload();
    await openEdit(page, SLUG);
    await expect(editor.locator('a[href="https://ec.europa.eu/info"]')).toHaveText('rehbere');
    await expect(editor.locator('a[href="/tr/fiyatlar"]')).toHaveText('fiyatlar sayfasına');
    await expect(editor.getByRole('img', { name: 'Fon akış şeması' })).toHaveAttribute('src', imageUrl);
    await page.screenshot({ path: `${SHOTS}/04-editor-after-reload.png` });

    // The public page.
    await page.goto(`/tr/blog/${SLUG}`);
    const article = page.locator('article .prose');
    const outside = article.getByRole('link', { name: 'rehbere' });
    await expect(outside).toHaveAttribute('href', 'https://ec.europa.eu/info');
    await expect(outside).toHaveAttribute('target', '_blank');
    await expect(outside).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    const inside = article.getByRole('link', { name: 'fiyatlar sayfasına' });
    await expect(inside).toHaveAttribute('href', '/tr/fiyatlar');
    await expect(inside).not.toHaveAttribute('target', /.*/);
    const img = article.getByRole('img', { name: 'Fon akış şeması' });
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    expect(await article.innerText()).not.toMatch(/\]\(|!\[/);
    await page.screenshot({ path: `${SHOTS}/05-public-post.png`, fullPage: true });
  });

  /**
   * The editor is skipped: the save request leaves the browser with raw
   * markdown swapped into its `content`, the way any HTTP client could send
   * it. The server action answers with the refusal and the row is unchanged.
   */
  for (const [name, injected, message] of [
    ['a javascript: link', '[tıkla](javascript:alert(1))', 'İçerikte izin verilmeyen bir bağlantı var.'],
    ['a protocol-relative link', '[tıkla](//evil.example/x)', 'İçerikte izin verilmeyen bir bağlantı var.'],
    ['an outside image', '![grafik](https://evil.example/blog/x.png)', 'İçerikte kullanılamayan bir görsel var.'],
  ] as const) {
    test(`raw markdown with ${name} posted to the save action is refused`, async ({ page }) => {
      let rewritten = 0;
      await page.route('**/tr/admin/blog', async (route: Route) => {
        const req = route.request();
        if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
        const body = JSON.parse(req.postData() ?? '[]') as [string, { content?: string }];
        if (body[0] !== RAW_SLUG || !body[1]) return route.continue();
        body[1].content = `${ORIGINAL}\n\n${injected}`;
        rewritten++;
        return route.continue({ postData: JSON.stringify(body) });
      });

      await openEdit(page, RAW_SLUG);
      // The page sends other server actions too; this is the save of this post.
      const answer = page.waitForResponse(
        (r) => Boolean(r.request().headers()['next-action']) && (r.request().postData() ?? '').startsWith(`["${RAW_SLUG}"`)
      );
      await page.getByTestId('blog-submit').click();
      const res = await answer;
      expect(rewritten).toBe(1);
      expect(await res.text()).toMatch(/invalid_content_(link|image)/);
      await expect(page.getByTestId('blog-form-error')).toContainText(message);
      await expect(page.getByTestId('blog-success')).toHaveCount(0);
      expect((await prisma.blogPost.findUnique({ where: { slug: RAW_SLUG } }))?.content).toBe(ORIGINAL);
    });
  }

  test('a paste keeps an allowed link, drops a javascript: link and never inserts an outside image', async ({ page }) => {
    await openEdit(page, RAW_SLUG);
    const editor = blogContentEditor(page);
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await pasteInto(editor, {
      html:
        '<p>Bkz. <a href="https://example.org/a">iyi bağlantı</a>, <a href="javascript:alert(1)">kötü bağlantı</a>, ' +
        '<a href="data:text/html,x">veri bağlantısı</a></p><img src="https://evil.example/x.png" alt="dış görsel">',
      text: 'Bkz. iyi bağlantı',
    });
    await expect(editor.locator('a')).toHaveCount(1);
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.org/a');
    await expect(editor).toContainText('kötü bağlantı');
    await expect(editor).toContainText('veri bağlantısı');
    await expect(editor.locator('img')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/06-paste.png` });

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');
    const content = (await prisma.blogPost.findUnique({ where: { slug: RAW_SLUG } }))?.content ?? '';
    expect(content).toContain('[iyi bağlantı](https://example.org/a)');
    expect(content).not.toMatch(/javascript|data:|evil\.example|!\[/);
  });

  test('keyboard: the link tool opens a labelled dialog, Escape closes it and focus comes back', async ({ page }) => {
    await openEdit(page, RAW_SLUG);
    const toolbar = page.getByRole('toolbar', { name: 'Biçimlendirme' });
    const linkTool = toolbar.getByRole('button', { name: 'Bağlantı' });
    await linkTool.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Bağlantı ekle' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Görünen metin')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(linkTool).toBeFocused();
    // The post form is still open and unchanged: the dialog's own form never submitted it.
    await expect(page.getByTestId('blog-submit')).toBeVisible();
  });
});

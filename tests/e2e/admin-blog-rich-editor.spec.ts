import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { blogContentEditor, pasteInto } from './fixtures/rich-editor';

/**
 * TASK-MVDKHOXGRQQS5 — the admin blog content field is a rich text editor that
 * still stores markdown. Real clicks on its toolbar: an existing post gains a
 * heading, bold text and both list kinds → save → the row holds exactly that
 * markdown → reload, the editor shows the same blocks → the public page
 * renders them, with no raw `**` / `*` left. A paste from Word or a web page
 * keeps only what the site can show.
 */

const SHOTS = shotsDir('TASK-MVDKHOXGRQQS5-screenshots');
const RUN = Math.random().toString(36).slice(2, 8);
const SLUG = `e2e-zengin-editor-${RUN}`;
const PASTE_SLUG = `e2e-zengin-yapistir-${RUN}`;
const ORIGINAL = 'Bu yazı editör testinden önce vardı ve düz bir paragraftır.';

const ADMIN = {
  userId: 'e2e-blog-rich-editor-admin',
  email: 'blog-rich-editor-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

/** What Word puts on the clipboard, trimmed to the parts that matter here. */
const WORD_HTML = [
  '<h1>Word başlığı</h1>',
  '<p class="MsoNormal">Normal <i>italik</i> <b style="mso-bidi-font-weight:normal">kalın</b> <s>çizili</s> <code>kod</code> <u>altı çizili</u> <a href="https://example.test">bağlantı</a><o:p></o:p></p>',
  '<blockquote><p>Alıntı metni</p></blockquote>',
  '<h4>Dördüncü düzey</h4>',
  '<ul><li>dış madde<ul><li>iç madde</li></ul></li></ul>',
  '<ol start="4"><li>dört</li><li>beş</li></ol>',
  '<hr>',
  '<p class="MsoListParagraph">1. Ocak toplantısı</p>',
  '<table><tr><td>hücre</td></tr></table>',
  '<img src="https://example.test/x.png" alt="resim">',
].join('');

async function openEdit(page: Page, slug: string): Promise<void> {
  await page.getByRole('row').filter({ hasText: slug }).getByRole('button', { name: 'Düzenle' }).click();
  await expect(blogContentEditor(page)).toBeVisible();
}

async function save(page: Page): Promise<void> {
  await page.getByTestId('blog-submit').click();
  await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');
}

test.describe.serial('admin blog — rich text editor, stored as markdown', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    for (const slug of [SLUG, PASTE_SLUG]) {
      await prisma.blogPost.create({
        data: {
          slug,
          title: `E2E zengin editör ${slug}`,
          excerpt: 'Zengin metin editörü uçtan uca testi.',
          content: ORIGINAL,
          category: 'E2E',
          readMinutes: 1,
          publishedAt: new Date(),
          image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
        },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { in: [SLUG, PASTE_SLUG] } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    // The CDN is not this test's subject; answer for it so CI needs no internet.
    await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204 }));
    await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL as string);
    await page.goto('/tr/admin/blog');
  });

  test('toolbar: heading, bold, both lists → saved as markdown → reload → site renders it', async ({ page }) => {
    await openEdit(page, SLUG);
    const editor = blogContentEditor(page);
    await expect(editor).toHaveText(ORIGINAL);
    // Only what the site renders is offered.
    const toolbar = page.getByRole('toolbar', { name: 'Biçimlendirme' });
    await expect(toolbar.getByRole('button')).toHaveCount(10);
    for (const name of ['Başlık 1', 'Başlık 2', 'Başlık 3', 'Kalın', 'Madde listesi', 'Numaralı liste', 'Bağlantı', 'Görsel', 'Geri al', 'Yinele']) {
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    }

    // Caret at the end of the existing paragraph: a click right of its last word,
    // once the editor holds focus (ProseMirror resets a caret set within 200 ms
    // of the first focus, taking it for the browser's own reset).
    await editor.click();
    await expect(editor).toBeFocused();
    const last = editor.locator('p').last();
    const box = await last.boundingBox();
    await last.click({ position: { x: (box?.width ?? 2) - 2, y: (box?.height ?? 2) / 2 } });
    await expect
      .poll(() => page.evaluate(() => { const s = getSelection(); return s?.isCollapsed && s.focusOffset === s.focusNode?.textContent?.length; }))
      .toBe(true);
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Başlık 2' }).click();
    await page.keyboard.type('Editör başlığı');
    await expect(toolbar.getByRole('button', { name: 'Başlık 2' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bir ');
    await toolbar.getByRole('button', { name: 'Kalın' }).click();
    await page.keyboard.type('kalın');
    await toolbar.getByRole('button', { name: 'Kalın' }).click();
    await page.keyboard.type(' kelime.');
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Madde listesi' }).click();
    await page.keyboard.type('birinci madde');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ikinci madde');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // an empty item leaves the list
    await toolbar.getByRole('button', { name: 'Numaralı liste' }).click();
    await page.keyboard.type('bir');
    await page.keyboard.press('Enter');
    await page.keyboard.type('iki');
    await page.screenshot({ path: `${SHOTS}/01-editor-toolbar-edit.png` });

    await save(page);
    const row = await prisma.blogPost.findUnique({ where: { slug: SLUG } });
    expect(row?.content).toBe(
      [ORIGINAL, '## Editör başlığı', 'Bir **kalın** kelime.', '* birinci madde\n* ikinci madde', '1. bir\n2. iki'].join('\n\n')
    );

    // Reload: the stored markdown opens as the same blocks.
    await page.reload();
    await openEdit(page, SLUG);
    await expect(editor.locator('h2')).toHaveText('Editör başlığı');
    await expect(editor.locator('strong')).toHaveText('kalın');
    await expect(editor.locator('ul > li')).toHaveText(['birinci madde', 'ikinci madde']);
    await expect(editor.locator('ol > li')).toHaveText(['bir', 'iki']);
    await page.screenshot({ path: `${SHOTS}/02-editor-after-reload.png` });

    // The public page: `##` is the page's section heading, bold is <strong>, no raw markers.
    await page.goto(`/tr/blog/${SLUG}`);
    const article = page.locator('article .prose');
    await expect(article.getByRole('heading', { name: 'Editör başlığı' })).toBeVisible();
    await expect(article.locator('strong')).toHaveText('kalın');
    await expect(article.locator('ul > li')).toHaveText(['birinci madde', 'ikinci madde']);
    await expect(article.locator('ol > li')).toHaveText(['bir', 'iki']);
    expect(await article.innerText()).not.toMatch(/\*|#/);
    await article.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-public-post.png`, fullPage: true });
  });

  test('a paste from Word keeps only what the site shows; no raw markers reach the page', async ({ page }) => {
    await openEdit(page, PASTE_SLUG);
    const editor = blogContentEditor(page);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await pasteInto(editor, { html: WORD_HTML, text: 'Word başlığı' });
    // Dropped in the editor already: no italic, strike, code, quote, rule, table cell, image.
    // An https link is kept (TASK-MVDPHZQCTVJ2R); a pasted image never is.
    // Ctrl+A then paste replaces the whole post; the heading is not glued to the old paragraph.
    await expect(editor.locator('h1')).toHaveText('Word başlığı');
    await expect(editor).not.toContainText(ORIGINAL);
    await expect(editor.locator('strong')).toHaveText('kalın');
    // The browser's clipboard writes the address normalised, with its trailing slash.
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.test/');
    await expect(editor.locator('em, i, s, code, u, blockquote, hr, table, img, h4, li ul, li ol')).toHaveCount(0);
    // Numbered from 1, as the page will number it.
    await expect(editor.locator('ol')).not.toHaveAttribute('start', /.*/);
    await page.screenshot({ path: `${SHOTS}/04-editor-word-paste.png` });

    await save(page);
    const content = (await prisma.blogPost.findUnique({ where: { slug: PASTE_SLUG } }))?.content ?? '';
    expect(content).toContain('# Word başlığı');
    expect(content).toContain('**kalın**');
    expect(content).toContain('[bağlantı](https://example.test/)');
    expect(content.replace('[bağlantı](https://example.test/)', '')).not.toMatch(/[_~`<>[\]]|^[ \t]+[*\d]|^-{3}/m);

    await page.goto(`/tr/blog/${PASTE_SLUG}`);
    const article = page.locator('article .prose');
    const text = await article.innerText();
    expect(text).not.toContain('*');
    expect(text).toContain('italik');
    expect(text).toContain('bağlantı');
    // A Word paragraph that merely starts with "1." stays a paragraph, as in the editor.
    await expect(article.locator('p', { hasText: '1. Ocak toplantısı' })).toBeVisible();
    await expect(article.locator('ol > li')).toHaveText(['dört', 'beş']);
    await page.screenshot({ path: `${SHOTS}/05-public-word-paste.png`, fullPage: true });
  });

  test('keyboard only: Tab reaches the tools with a visible focus ring, Space applies one', async ({ page }) => {
    await openEdit(page, SLUG);
    const toolbar = page.getByRole('toolbar', { name: 'Biçimlendirme' });
    await page.getByLabel('Özet (Excerpt) *').focus();
    await page.keyboard.press('Tab');
    const h1 = toolbar.getByRole('button', { name: 'Başlık 1', exact: true });
    await expect(h1).toBeFocused();
    // The ring is the focus indicator; it must actually paint.
    expect(await h1.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    await page.screenshot({ path: `${SHOTS}/07-keyboard-focus-ring.png` });
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    const bold = toolbar.getByRole('button', { name: 'Kalın', exact: true });
    await expect(bold).toBeFocused();
    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(blogContentEditor(page)).toBeFocused();
    await page.keyboard.type('klavye');
    await expect(blogContentEditor(page).locator('strong', { hasText: 'klavye' })).toHaveCount(1);
  });

  test('an empty editor is refused before anything is sent', async ({ page }) => {
    await openEdit(page, PASTE_SLUG);
    const editor = blogContentEditor(page);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-form-error')).toHaveText('Makale içeriği boş olamaz.');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('blog-success')).toHaveCount(0);
    expect((await prisma.blogPost.findUnique({ where: { slug: PASTE_SLUG } }))?.content).toContain('# Word başlığı');
  });
});

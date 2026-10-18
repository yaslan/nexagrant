import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { blogContentEditor } from './fixtures/rich-editor';

/**
 * TASK-MVDPA19QP3M9A — a new blog post starts with nothing nobody chose: no
 * stock cover, no fixed "5 min read", and the byline is the signed-in admin's
 * own name. The read time follows the content, in the admin's language, until
 * the admin types one; an existing post keeps the read time it was saved with.
 */

const SHOTS = shotsDir('TASK-MVDPA19QP3M9A-screenshots');
const RUN = Math.random().toString(36).slice(2, 8);
const EXISTING_SLUG = `e2e-yeni-yazi-varsayilan-${RUN}`;
const NEW_TITLE = `E2E görselsiz yazı ${RUN}`;
/** ~450 words: two minutes at 200 words a minute. */
const LONG = Array.from({ length: 450 }, (_, i) => `kelime${i % 9}`).join(' ');

const ADMIN = {
  userId: 'e2e-blog-new-defaults-admin',
  email: 'blog-new-defaults-admin@e2e.fabrika.test',
  name: 'Blog Varsayılan Yöneticisi',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

const readTime = (page: Page) => page.getByTestId('blog-read-time');

async function openNew(page: Page, locale: 'tr' | 'en'): Promise<void> {
  await page.goto(`/${locale}/admin/blog`);
  await page.getByTestId('blog-new').click();
  await expect(page.locator('#blog-title')).toBeVisible();
}

async function typeContent(page: Page, text: string): Promise<void> {
  await page.getByTestId('blog-content-field').getByRole('textbox').click();
  await page.keyboard.insertText(text);
}

test.describe.serial('admin blog — a new post has no invented defaults', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    await prisma.blogPost.create({
      data: {
        slug: EXISTING_SLUG,
        title: `E2E mevcut yazı ${EXISTING_SLUG}`,
        excerpt: 'Kayıtlı okuma süresi korunur.',
        content: 'Kısa bir mevcut yazı.',
        category: 'E2E',
        readMinutes: 9,
        authorName: 'Kayıtlı Yazar',
        publishedAt: new Date(),
        image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
      },
    });
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { OR: [{ slug: EXISTING_SLUG }, { title: NEW_TITLE }] } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    // The CDN is not this test's subject; answer for it so CI needs no internet.
    await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204 }));
    await signInAs(
      page,
      { id: ADMIN.userId, email: ADMIN.email, name: ADMIN.name, tenantId: ADMIN.tenantId, role: ADMIN.role },
      baseURL as string
    );
  });

  test('new post: empty cover, read time from the content, refused without a cover', async ({ page }) => {
    await openNew(page, 'tr');
    await expect(page.getByTestId('blog-image-preview')).toHaveCount(0);
    await expect(page.getByText('Görsel seç', { exact: true })).toBeVisible();
    // The byline is the signed-in admin's own name, nothing appended to it.
    await expect(page.locator('label:has-text("Yazar Adı") + input')).toHaveValue(ADMIN.name);
    await expect(readTime(page)).toHaveValue('');
    await expect(page.getByLabel('Okuma süresi (dakika)')).toHaveAccessibleDescription(
      'İçerikten otomatik hesaplanır; elle değiştirebilirsiniz. Sitede okuyucunun dilinde gösterilir.'
    );
    await expect(readTime(page)).toHaveAttribute('type', 'number');

    await page.locator('#blog-title').fill(NEW_TITLE);
    await page.locator('#blog-excerpt').fill('Görselsiz kayıt reddedilir.');
    await typeContent(page, 'Kısa giriş.');
    await expect(readTime(page)).toHaveValue('1');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(LONG);
    await expect(readTime(page)).toHaveValue('2');
    await page.screenshot({ path: `${SHOTS}/01-new-post-auto-read-time.png` });

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-form-error')).toHaveText('Kaydetmeden önce bir kapak görseli yükleyin.');
    expect(await prisma.blogPost.count({ where: { title: NEW_TITLE } })).toBe(0);
  });

  test('content with no readable words: the empty read time is caught before saving', async ({ page }) => {
    await openNew(page, 'tr');
    await page.locator('#blog-title').fill(NEW_TITLE);
    await page.locator('#blog-excerpt').fill('Okunacak kelime yok.');
    // Rules and stars only: the editor is not empty, but there is nothing to read.
    await typeContent(page, '--- *** ---');
    await expect(blogContentEditor(page)).toContainText('***');
    await expect(readTime(page)).toHaveValue('');

    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-form-error')).toHaveText(
      'Okuma süresi boş olamaz. İçerikte okunacak metin yoksa süreyi elle yazın.'
    );
    await expect(readTime(page)).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({ path: `${SHOTS}/03-read-time-missing.png` });
    expect(await prisma.blogPost.count({ where: { title: NEW_TITLE } })).toBe(0);

    await readTime(page).fill('1');
    await expect(readTime(page)).not.toHaveAttribute('aria-invalid');
  });

  test('a read time typed by the admin is not overwritten by the estimate', async ({ page }) => {
    await openNew(page, 'tr');
    await readTime(page).fill('7');
    await typeContent(page, LONG);
    await expect(blogContentEditor(page)).toContainText('kelime8');
    await expect(readTime(page)).toHaveValue('7');
  });

  test('the estimate is a number of minutes in either admin language (TASK-MVDSY96TB1EPM)', async ({ page }) => {
    await openNew(page, 'en');
    await expect(readTime(page)).toHaveValue('');
    await typeContent(page, LONG);
    await expect(readTime(page)).toHaveValue('2');
  });

  test('a read time outside 1–120 is refused by the field and nothing is saved', async ({ page }) => {
    await openNew(page, 'tr');
    await page.locator('#blog-title').fill(NEW_TITLE);
    await page.locator('#blog-excerpt').fill('Aralık dışı okuma süresi.');
    await typeContent(page, LONG);
    await readTime(page).fill('121');
    await page.getByTestId('blog-submit').click();
    expect(await readTime(page).evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true);
    await readTime(page).fill('0');
    await page.getByTestId('blog-submit').click();
    expect(await readTime(page).evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
    expect(await prisma.blogPost.count({ where: { title: NEW_TITLE } })).toBe(0);
  });

  test('editing a post keeps its saved read time, cover and author', async ({ page }) => {
    await page.goto('/tr/admin/blog');
    await page.getByRole('row').filter({ hasText: EXISTING_SLUG }).getByRole('button', { name: 'Düzenle' }).click();
    await expect(blogContentEditor(page)).toHaveText('Kısa bir mevcut yazı.');
    await expect(readTime(page)).toHaveValue('9');
    await expect(page.locator('label:has-text("Yazar Adı") + input')).toHaveValue('Kayıtlı Yazar');
    await expect(page.getByTestId('blog-image-preview')).toHaveAttribute('src', /photo-1522071820081/);
    await typeContent(page, ` ${LONG}`);
    await expect(blogContentEditor(page)).toContainText('kelime8');
    await expect(readTime(page)).toHaveValue('9');
    await page.screenshot({ path: `${SHOTS}/02-edit-keeps-read-time.png` });
  });
});

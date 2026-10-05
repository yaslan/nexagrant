import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * AKTAR-MURBCJ0A-1 — an admin's blog post survives the server that wrote it.
 *
 * The posts used to live in a module-level array: the editor showed "saved",
 * the post page answered 200 from that one process's memory, and after a
 * restart (or on another instance) it was a 404. So every "it was saved" below
 * is checked from OUTSIDE the server process: the row is read from Postgres by
 * this test process, and the public page is fetched by a fresh, signed-out
 * request context.
 *
 * Driven by real clicks in /tr/admin/blog. Rows are keyed by a per-run title,
 * so the spec is safe to repeat on a shared database.
 */

const SHOTS = shotsDir('AKTAR-MURBCJ0A-1-blog-screenshots');
const RUN = Math.random().toString(36).slice(2, 8);
const TITLE = `E2E kalıcılık testi ${RUN}`;
const SLUG = `e2e-kalicilik-testi-${RUN}`;
// Markup an editor might paste. The post page renders content as React text
// nodes; none of this may become an element.
const HOSTILE = '<script>window.__blogXss = 1</script>';
const HOSTILE_IMG = '<img src=x onerror="window.__blogXss = 2">';
const CONTENT = [
  '# Kalıcılık',
  '',
  'Bu yazı uçtan uca testin yazdığı içeriktir ve sunucu yeniden başlasa da kalmalıdır.',
  '',
  HOSTILE,
  HOSTILE_IMG,
  '',
  '* **kalın** madde',
].join('\n');

/**
 * A platform-admin seat of this spec's own (TENANT_OWNER on the demo tenant, every
 * workspace, `User.isPlatformAdmin` set: the reach of the demo admin seat it replaces),
 * seeded in `beforeAll` and removed in `afterAll`. The session is a minted cookie, not
 * the demo sign-in form, so the spec runs against `next start` too (TASK-MUSBCXP9RKS3D).
 * The platform-admin right comes from the database row; the cookie carries no claim for it.
 */
const ADMIN = {
  userId: 'e2e-blog-persistence-admin',
  email: 'blog-persistence-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  // signInAs also records the cookie consent the banner would otherwise ask for.
  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL);
}

async function fillNewPost(page: Page): Promise<void> {
  await page.getByTestId('blog-new').click();
  await page.getByLabel('Makale Başlığı *').fill(TITLE);
  await page.getByLabel('Kategori *').fill('E2E');
  await page.getByLabel('Özet (Excerpt) *').fill('Uçtan uca kalıcılık testinin kısa özeti.');
  await page.getByLabel('Makale İçeriği (Markdown) *').fill(CONTENT);
  await page.getByTestId('blog-submit').click();
}

test.describe.serial('admin blog — a post outlives the process that wrote it', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: 'e2e-kalicilik-testi-' } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('publish → the row is in Postgres → a signed-out request gets 200, markup stays text', async ({
    page,
    baseURL,
    playwright,
  }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await fillNewPost(page);

    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı kaydedildi.');
    await expect(page.getByTestId('blog-form-error')).toHaveCount(0);
    await expect(page.getByRole('cell', { name: new RegExp(SLUG) })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-admin-saved.png`, fullPage: true });

    // Read back by this test process, over its own connection.
    const row = await prisma.blogPost.findUnique({ where: { slug: SLUG } });
    expect(row).toMatchObject({ title: TITLE, category: 'E2E', createdById: ADMIN.userId });
    expect(row?.content).toContain(HOSTILE);

    // A fresh, cookieless client.
    const anon = await playwright.request.newContext({ baseURL });
    const res = await anon.get(`/tr/blog/${SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(TITLE);
    // React escaped the pasted markup: it is in the page only as text.
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain(HOSTILE_IMG);
    expect(html).toContain('&lt;script&gt;window.__blogXss = 1&lt;/script&gt;');
    expect((await anon.get('/tr/blog')).status()).toBe(200);
    await anon.dispose();

    // In a real browser: the text is visible, no element was created, nothing ran.
    await page.goto(`/tr/blog/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText(HOSTILE)).toBeVisible();
    await expect(page.locator('article img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __blogXss?: number }).__blogXss)).toBeUndefined();
    await page.screenshot({ path: `${SHOTS}/02-public-post.png`, fullPage: true });
  });

  test('the same title again is refused with the slug_taken message, and nothing is added', async ({
    page,
    baseURL,
  }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    await fillNewPost(page);

    const errorMsg = page.getByTestId('blog-form-error');
    await expect(errorMsg).toHaveText(
      'Bu kısa adla (slug) bir yazı zaten var. Başlığı ya da kısa adı değiştirin.'
    );
    // Verify error is in viewport and focused (scrollIntoView works).
    await expect(errorMsg).toBeInViewport();
    await expect(errorMsg).toBeFocused();
    await expect(page.getByTestId('blog-success')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/03-slug-taken.png`, fullPage: true });
    expect(await prisma.blogPost.count({ where: { slug: { startsWith: SLUG } } })).toBe(1);
  });

  test('delete → the row is gone from Postgres → the public page is a 404', async ({ page, baseURL, playwright }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/blog');
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId(`blog-delete-${SLUG}`).click();

    await expect(page.getByTestId('blog-success')).toHaveText('Blog yazısı silindi.');
    await expect(page.getByTestId(`blog-delete-${SLUG}`)).toHaveCount(0);
    expect(await prisma.blogPost.findUnique({ where: { slug: SLUG } })).toBeNull();

    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get(`/tr/blog/${SLUG}`)).status()).toBe(404);
    await anon.dispose();
  });
});

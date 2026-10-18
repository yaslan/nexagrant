import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { BLOG_SEED_POSTS } from '../../src/lib/blog-seed';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-76 — the author byline is one line, "<Ünvan> <İsim>", in the same bold as
 * the name always was: on the post page, the blog listing, the landing
 * BlogSection and the admin list. A post with no ünvan shows the bare name.
 *
 * Two posts are written under a per-run slug and removed in `afterAll`, so the
 * spec is safe to repeat on a shared database.
 */

const SHOTS = shotsDir('FO-76-byline-screenshots');
const RUN = Math.random().toString(36).slice(2, 8);
const IMAGE = BLOG_SEED_POSTS[0]!.image;
const WITH_ROLE = { slug: `e2e-byline-role-${RUN}`, title: `E2E byline ünvanlı ${RUN}`, role: 'Dr.', name: 'Mehmet Yılmaz' };
const NO_ROLE = { slug: `e2e-byline-plain-${RUN}`, title: `E2E byline ünvansız ${RUN}`, role: '', name: 'Ayşe Demir' };
const WITH_ROLE_BYLINE = 'Dr. Mehmet Yılmaz';
const NO_ROLE_BYLINE = 'Ayşe Demir';

const ADMIN = {
  userId: 'e2e-fo76-byline-admin',
  email: 'fo76-byline-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL);
}

test.describe.serial('blog author byline — ünvan before name, one line', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    for (const post of [WITH_ROLE, NO_ROLE]) {
      await prisma.blogPost.create({
        data: {
          slug: post.slug,
          title: post.title,
          excerpt: 'FO-76 byline testinin kısa özeti.',
          content: 'Byline testinin içeriği.',
          category: 'E2E',
          readTime: '1 dk okuma',
          publishedAt: new Date(),
          authorName: post.name,
          authorRole: post.role || null,
          image: IMAGE,
          featured: true,
        },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: 'e2e-byline-' } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('post page: ünvan and name on one bold line; no ünvan means the bare name', async ({ page }) => {
    await page.goto(`/tr/blog/${WITH_ROLE.slug}`);
    const byline = page.getByText(WITH_ROLE_BYLINE, { exact: true });
    await expect(byline).toBeVisible();
    expect(Number((await byline.evaluate((el) => getComputedStyle(el).fontWeight)))).toBeGreaterThanOrEqual(600);
    // The name no longer stands alone on its own line.
    await expect(page.getByText('Mehmet Yılmaz', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/post-with-role-desktop.png`, fullPage: false });

    await page.goto(`/tr/blog/${NO_ROLE.slug}`);
    await expect(page.getByText(NO_ROLE_BYLINE, { exact: true })).toBeVisible();
  });

  test('blog listing and landing BlogSection show the same byline', async ({ page }) => {
    await page.goto('/tr/blog');
    await expect(page.getByText(WITH_ROLE_BYLINE, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(NO_ROLE_BYLINE, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/blog-listing-desktop.png`, fullPage: false });

    await page.goto('/tr');
    await expect(page.getByText(WITH_ROLE_BYLINE, { exact: true }).first()).toBeVisible();
  });

  test('admin list shows the byline on one line', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL!);
    await page.goto('/tr/admin/blog');
    await expect(page.getByText(WITH_ROLE_BYLINE, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/admin-list-desktop.png`, fullPage: false });
  });

  test.describe('phone width (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('no horizontal page overflow on the listing, landing and post page', async ({ page }) => {
      for (const path of ['/tr/blog', '/tr', `/tr/blog/${WITH_ROLE.slug}`]) {
        await page.goto(path);
        await expect(page.getByText(WITH_ROLE_BYLINE, { exact: true }).first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
      }
      await page.goto('/tr/blog');
      await page.screenshot({ path: `${SHOTS}/blog-listing-375.png`, fullPage: false });
    });
  });
});

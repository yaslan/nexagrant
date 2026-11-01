import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MUU76GFV3DWQ — the public blog as a reader meets it, driven by real clicks:
 * /tr/blog list → click a card → the post → back to the list, the same in /en,
 * and a slug that does not exist is a real 404.
 *
 * Two posts are written straight to the BlogPost table (the admin editor has its
 * own spec, admin-blog-persistence.spec.ts) with a per-run slug, dated in the
 * future so they head the list (ORDER BY publishedAt DESC, src/lib/blog.ts).
 * afterAll deletes only this run's rows (slug prefix e2e-okur-<run>).
 */

const SHOTS = shotsDir('TASK-MUU76GFV3DWQ-screenshots');
const RUN = Math.random().toString(36).slice(2, 8);
const PREFIX = `e2e-okur-${RUN}`;
const IMAGE = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80';

const NEWER = {
  slug: `${PREFIX}-yeni`,
  title: `E2E okur yazısı yeni ${RUN}`,
  excerpt: 'Okur akışını sınayan yeni yazının özeti.',
  content: ['## Okur bölümü', '', 'Bu paragraf **kalın** bir kelime içerir.', '', '* birinci madde', '* ikinci madde'].join('\n'),
  category: 'E2E Okur',
  // Ahead of any real post, so the two always head the list in this order.
  publishedAt: new Date('2099-01-02T00:00:00Z'),
};
const OLDER = {
  slug: `${PREFIX}-eski`,
  title: `E2E okur yazısı eski ${RUN}`,
  excerpt: 'Okur akışını sınayan eski yazının özeti.',
  content: 'Eski yazının tek paragrafı.',
  category: 'E2E Okur',
  publishedAt: new Date('2099-01-01T00:00:00Z'),
};

test.describe.serial('blog reader — list → post → back, TR and EN, 404 on a missing slug', () => {
  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.blog-reader.seed', async (tx) => {
      for (const post of [NEWER, OLDER]) {
        await tx.blogPost.create({ data: { ...post, readMinutes: 2, image: IMAGE } });
      }
    });
  });

  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.blog-reader.cleanup', (tx) =>
      // Only this run's rows: every slug the spec writes starts with PREFIX.
      tx.blogPost.deleteMany({ where: { slug: { startsWith: PREFIX } } })
    );
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true })
      );
    });
  });

  test('TR: the list shows both seeded posts newest first, a card click opens the post', async ({ page }) => {
    const res = await page.goto('/tr/blog');
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('heading', { level: 1, name: 'AB Proje Yönetimi & Hibe Blogu' })).toBeVisible();

    const titles = page.locator('article h2');
    await expect(titles.nth(0)).toHaveText(NEWER.title);
    await expect(titles.nth(1)).toHaveText(OLDER.title);

    const card = page.locator('article').filter({ hasText: NEWER.title });
    await expect(card.getByText(NEWER.excerpt)).toBeVisible();
    await expect(card.getByText(NEWER.category, { exact: true })).toBeVisible();
    // Stored as minutes, written in the reader's language (TASK-MVDSY96TB1EPM).
    await expect(card.getByText('2 dk okuma', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/10-tr-blog-list.png` });

    await card.getByRole('link', { name: 'Devamını Oku' }).click();

    await expect(page).toHaveURL((url) => url.pathname === `/tr/blog/${NEWER.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: NEWER.title })).toBeVisible();
    // Markdown body: "## x" renders as a heading, **x** as <strong>, "* x" as list items.
    await expect(page.getByRole('heading', { name: 'Okur bölümü' })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'kalın' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'ikinci madde' })).toBeVisible();
    await expect(page.getByText('• 2 dk okuma', { exact: true })).toBeVisible();
    // The other seeded post is offered as related reading.
    await expect(page.getByRole('link', { name: new RegExp(OLDER.title) })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/11-tr-blog-post.png`, fullPage: true });

    await page.getByRole('link', { name: /Tüm Blog Yazılarına Dön/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/tr/blog');
    await expect(page.locator('article h2').nth(0)).toHaveText(NEWER.title);
  });

  test('TR: the title link and the related-post link lead to the right posts', async ({ page }) => {
    await page.goto('/tr/blog');
    await page.locator('article h2').getByRole('link', { name: OLDER.title }).click();
    await expect(page).toHaveURL((url) => url.pathname === `/tr/blog/${OLDER.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: OLDER.title })).toBeVisible();
    await expect(page.getByText('Eski yazının tek paragrafı.')).toBeVisible();

    await page.getByRole('link', { name: new RegExp(NEWER.title) }).click();
    await expect(page).toHaveURL((url) => url.pathname === `/tr/blog/${NEWER.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: NEWER.title })).toBeVisible();
  });

  test('EN: the list has English chrome and a card opens the post', async ({ page }) => {
    const res = await page.goto('/en/blog');
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'EU Grant Management & Insights Blog' })).toBeVisible();

    const card = page.locator('article').filter({ hasText: NEWER.title });
    await expect(card.getByText('2 min read', { exact: true })).toBeVisible();
    await card.getByRole('link', { name: 'Read Article' }).click();

    await expect(page).toHaveURL((url) => url.pathname === `/en/blog/${NEWER.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: NEWER.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Related Articles' })).toBeVisible();
    await expect(page.getByText('• 2 min read', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/12-en-blog-post.png`, fullPage: true });

    await page.getByRole('link', { name: /Back to Blog/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/en/blog');
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale.toUpperCase()}: a slug that does not exist answers 404`, async ({ page }) => {
      const res = await page.goto(`/${locale}/blog/${PREFIX}-yok`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: NEWER.title })).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/13-${locale}-blog-404.png` });
    });
  }

  test('a deleted post disappears from the list and its page turns 404', async ({ page }) => {
    const gone = `${PREFIX}-silinen`;
    await withSystemScope('platform-admin', 'e2e.blog-reader.seed-gone', (tx) =>
      tx.blogPost.create({
        data: { ...OLDER, slug: gone, title: `E2E silinecek ${RUN}`, readMinutes: 1, image: IMAGE },
      })
    );
    await page.goto('/tr/blog');
    await expect(page.locator('article h2', { hasText: `E2E silinecek ${RUN}` })).toHaveCount(1);

    await withSystemScope('platform-admin', 'e2e.blog-reader.delete-gone', (tx) =>
      tx.blogPost.deleteMany({ where: { slug: gone } })
    );
    await page.reload();
    await expect(page.locator('article h2', { hasText: `E2E silinecek ${RUN}` })).toHaveCount(0);
    const res = await page.goto(`/tr/blog/${gone}`);
    expect(res?.status()).toBe(404);
  });
});

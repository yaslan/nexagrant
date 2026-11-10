import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { BlogPost } from '@/lib/blog-shared';
import en from '../messages/en.json';
import tr from '../messages/tr.json';

/**
 * NG-121 (K-580095 = A) — BlogPost is single-language and every post is
 * Turkish, so the posts are shown on the Turkish routes only. On /en/blog, the
 * /en landing BlogSection, /en/blog/<slug> and the sitemap no Turkish post text
 * or English blog address may appear; on /tr nothing changes. The real pages
 * are rendered with only their data source (a Turkish post) stubbed and the
 * real message catalogs behind getTranslations.
 */

const POST: BlogPost = {
  slug: 'horizon-europe-konsorsiyum-rehberi',
  title: 'Horizon Europe Çalışma Programlarında Başarılı Konsorsiyum Kurma Rehberi',
  excerpt: 'Konsorsiyum kurarken ortak seçiminin püf noktaları.',
  content: '## Giriş\n\nTürkçe gövde paragrafı.',
  category: 'Rehber',
  readMinutes: 4,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  image: 'https://images.unsplash.com/x',
  featured: true,
};
const OTHER: BlogPost = { ...POST, slug: 'cordis-analitigi', title: 'CORDIS Analitiği ile Ortak Bulma' };

vi.mock('@/lib/blog', async () => {
  const shared = await vi.importActual<typeof import('@/lib/blog-shared')>('@/lib/blog-shared');
  return {
    ...shared,
    getBlogPosts: async () => [POST, OTHER],
    getFeaturedBlogPosts: async () => [POST, OTHER],
    getBlogPostBySlug: async (slug: string) => [POST, OTHER].find((p) => p.slug === slug) ?? null,
  };
});
vi.mock('@/lib/db', () => ({ prisma: { topic: { findMany: async () => [] } } }));
vi.mock('@/lib/app-url', () => ({ appUrl: () => 'https://nexagrant.test' }));
vi.mock('@/lib/storage', () => ({ publicAssetStore: () => undefined }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }) }));

type Catalog = Record<string, unknown>;
const CATALOGS: Record<string, Catalog> = { en, tr };
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string, values: Record<string, unknown> = {}) => {
      const ns = CATALOGS[locale]?.[namespace] as Record<string, string> | undefined;
      const message = ns?.[key];
      if (message === undefined) throw new Error(`missing message ${locale}.${namespace}.${key}`);
      return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
    },
}));

// React's server renderer cannot await a nested async component, so the notice
// is rendered on its own below and stands in here as a marker.
vi.mock('@/components/blog/BlogTurkishOnlyNotice', () => ({
  default: ({ locale }: { locale: string }) => createElement('div', { 'data-testid': 'blog-turkish-only', 'data-locale': locale }),
}));

const { default: BlogIndexPage, generateMetadata: indexMetadata } = await import('@/app/[locale]/(public)/blog/page');
const { default: BlogDetailPage, generateMetadata: detailMetadata } = await import(
  '@/app/[locale]/(public)/blog/[slug]/page'
);
const { default: BlogSection } = await import('@/components/BlogSection');
const { default: sitemap } = await import('@/app/sitemap');
const RealNotice = (
  await vi.importActual<typeof import('@/components/blog/BlogTurkishOnlyNotice')>(
    '@/components/blog/BlogTurkishOnlyNotice'
  )
).default;
const { blogContentShownIn, BLOG_CONTENT_LOCALE } = await import('@/lib/blog-shared');

const params = (locale: string) => ({ params: Promise.resolve({ locale }) });
const postParams = (locale: string, slug: string) => ({ params: Promise.resolve({ locale, slug }) });

/** The thrown NEXT_REDIRECT's target, or null when the call did not redirect. */
async function redirectTarget(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw error;
    return digest.split(';')[2] ?? '';
  }
}

describe('NG-121 blog content locale', () => {
  test('posts are shown on Turkish routes only', () => {
    expect(BLOG_CONTENT_LOCALE).toBe('tr');
    expect(blogContentShownIn('tr')).toBe(true);
    expect(blogContentShownIn('en')).toBe(false);
  });

  test('the notice keys exist in both catalogs', () => {
    for (const key of ['onlyTurkishTitle', 'onlyTurkishBody', 'onlyTurkishLink']) {
      expect((en.blog as Record<string, string>)[key], `en.blog.${key}`).toBeTruthy();
      expect((tr.blog as Record<string, string>)[key], `tr.blog.${key}`).toBeTruthy();
    }
  });
});

describe('NG-121 /[locale]/blog list', () => {
  test('EN: no Turkish post title or excerpt, the notice instead', async () => {
    const html = renderToStaticMarkup(await BlogIndexPage(params('en')));
    expect(html).not.toContain(POST.title);
    expect(html).not.toContain(POST.excerpt);
    expect(html).not.toContain(OTHER.title);
    expect(html).not.toContain('/en/blog/');
    expect(html).toContain('data-testid="blog-turkish-only"');
    expect(html).toContain('EU Grant Management &amp; Insights Blog');
  });

  test('TR: both posts listed, no notice', async () => {
    const html = renderToStaticMarkup(await BlogIndexPage(params('tr')));
    expect(html).toContain(POST.title);
    expect(html).toContain(OTHER.title);
    expect(html).toContain(`/tr/blog/${POST.slug}`);
    expect(html).not.toContain('blog-turkish-only');
  });

  test('EN metadata is noindex and TR names no English alternate', async () => {
    const enMeta = await indexMetadata(params('en'));
    expect(enMeta.robots).toEqual({ index: false, follow: true });
    const trMeta = await indexMetadata(params('tr'));
    expect(trMeta.robots).toBeUndefined();
    expect(trMeta.alternates?.languages).toEqual({ tr: 'https://nexagrant.test/tr/blog' });
  });
});

describe('NG-121 landing BlogSection', () => {
  test('EN: no Turkish card, the notice instead', async () => {
    const html = renderToStaticMarkup((await BlogSection({ locale: 'en' }))!);
    expect(html).not.toContain(POST.title);
    expect(html).not.toContain(POST.excerpt);
    expect(html).toContain('data-testid="blog-turkish-only"');
  });

  test('TR: the featured cards as before', async () => {
    const html = renderToStaticMarkup((await BlogSection({ locale: 'tr' }))!);
    expect(html).toContain(POST.title);
    expect(html).toContain(OTHER.title);
    expect(html).not.toContain('blog-turkish-only');
  });
});

describe('NG-121 /[locale]/blog/<slug>', () => {
  test('EN: redirects to the Turkish post', async () => {
    expect(await redirectTarget(() => BlogDetailPage(postParams('en', POST.slug)))).toBe(`/tr/blog/${POST.slug}`);
  });

  test('EN: a slug that does not exist is still a 404, not a redirect', async () => {
    await expect(BlogDetailPage(postParams('en', 'yok-boyle-yazi'))).rejects.toMatchObject({
      digest: expect.stringContaining('HTTP_ERROR_FALLBACK;404'),
    });
  });

  test('EN metadata: noindex, canonical on the Turkish post, no Turkish title', async () => {
    const meta = await detailMetadata(postParams('en', POST.slug));
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe(`https://nexagrant.test/tr/blog/${POST.slug}`);
    expect(meta.title).toBeUndefined();
  });

  test('TR: renders the post, its metadata names no English alternate', async () => {
    expect(await redirectTarget(() => BlogDetailPage(postParams('tr', POST.slug)))).toBeNull();
    const html = renderToStaticMarkup(await BlogDetailPage(postParams('tr', POST.slug)));
    expect(html).toContain(POST.title);
    expect(html).toContain('Türkçe gövde paragrafı.');
    const meta = await detailMetadata(postParams('tr', POST.slug));
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.languages).toEqual({ tr: `https://nexagrant.test/tr/blog/${POST.slug}` });
  });
});

describe('NG-121 sitemap', () => {
  test('lists Turkish blog addresses only', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://nexagrant.test/tr/blog');
    expect(urls).toContain(`https://nexagrant.test/tr/blog/${POST.slug}`);
    expect(urls).toContain(`https://nexagrant.test/tr/blog/${OTHER.slug}`);
    expect(urls.filter((u) => u.includes('/en/blog'))).toEqual([]);
    // The rest of the English sitemap is untouched.
    expect(urls).toContain('https://nexagrant.test/en/pricing');
  });
});

describe('NG-121 Turkish-only notice', () => {
  test('EN: English text and a link to /tr/blog', async () => {
    const html = renderToStaticMarkup(await RealNotice({ locale: 'en' }));
    expect(html).toContain(en.blog.onlyTurkishTitle);
    expect(html).toContain(en.blog.onlyTurkishBody);
    expect(html).toContain('href="/tr/blog"');
    expect(html).toContain(en.blog.onlyTurkishLink);
  });
});

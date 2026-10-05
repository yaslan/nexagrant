import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

import {
  BLOG_IMAGE_HOSTS,
  BLOG_SLUG_PATTERN,
  BLOG_WRITE_ERRORS,
  formatBlogDate,
  slugifyTitle,
  validateBlogInput,
  type BlogPostInput,
} from '@/lib/blog-shared';
import { BLOG_SEED_POSTS } from '@/lib/blog-seed';

/**
 * AKTAR-MURBCJ0A-1 — the database-free half of the blog write path. The writes
 * themselves are measured against Postgres in tests/blog-posts.live.test.ts.
 */

const REPO = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const VALID: BlogPostInput = {
  title: 'Horizon Europe rehberi',
  excerpt: 'Konsorsiyum kurarken dikkat edilecekler.',
  content: '# Başlık\n\nBu içerik yirmi karakterden uzundur.',
  category: 'Horizon Europe',
  readTime: '5 dk okuma',
  authorName: '',
  authorRole: '',
  image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
  featured: true,
};

describe('every refusal code has a message, spelled the same, in both locales', () => {
  test.each(['tr', 'en'] as const)('%s adminBlog.errors matches BLOG_WRITE_ERRORS exactly', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`)) as {
      adminBlog: { errors: Record<string, string> };
    };
    expect(Object.keys(messages.adminBlog.errors).sort()).toEqual([...BLOG_WRITE_ERRORS].sort());
    for (const code of BLOG_WRITE_ERRORS) {
      expect(messages.adminBlog.errors[code]?.trim().length, `${locale} ${code}`).toBeGreaterThan(10);
    }
  });

  test('the editor shows a refusal through that namespace and success only on ok: true', () => {
    const client = read('src/app/[locale]/admin/blog/client.tsx');
    expect(client).toContain("useTranslations('adminBlog')");
    expect(client).toContain('t(`errors.${res.error}`)');
    // The old contract: success on any answer.
    expect(client).not.toMatch(/res\.success/);
    expect(client).toMatch(/if \(!res\.ok\)/);
  });
});

describe('image hosts are exactly the hosts next/image accepts', () => {
  test('BLOG_IMAGE_HOSTS equals images.remotePatterns in next.config.ts', () => {
    const config = read('next.config.ts');
    const hosts = [...config.matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1]);
    expect([...BLOG_IMAGE_HOSTS].sort()).toEqual([...hosts].sort());
  });

  test('every launch post image passes the same check', () => {
    for (const post of BLOG_SEED_POSTS) {
      expect(validateBlogInput({ ...post, authorName: '' }), post.slug).toMatchObject({ ok: true });
    }
  });
});

describe('validateBlogInput', () => {
  test('a complete submission is accepted, trimmed, and an empty byline is stored as none', () => {
    const r = validateBlogInput({ ...VALID, title: '  Horizon Europe rehberi  ' });
    expect(r).toEqual({
      ok: true,
      data: {
        title: 'Horizon Europe rehberi',
        excerpt: VALID.excerpt,
        content: VALID.content,
        category: VALID.category,
        readTime: VALID.readTime,
        image: VALID.image,
        featured: true,
        authorName: null,
        authorRole: null,
        authorAvatar: null,
      },
    });
  });

  test.each([
    ['title too short', { title: 'ab' }, 'invalid_title'],
    ['title too long', { title: 'x'.repeat(201) }, 'invalid_title'],
    ['excerpt empty', { excerpt: '   ' }, 'invalid_excerpt'],
    ['content too short', { content: 'kısa' }, 'invalid_content'],
    ['content too long', { content: 'x'.repeat(50_001) }, 'invalid_content'],
    ['category empty', { category: '' }, 'invalid_category'],
    ['read time too long', { readTime: 'x'.repeat(31) }, 'invalid_read_time'],
    ['image on a foreign host', { image: 'https://evil.example/a.png' }, 'invalid_image'],
    ['image over http', { image: 'http://images.unsplash.com/a.png' }, 'invalid_image'],
    ['image with a port', { image: 'https://images.unsplash.com:8443/a.png' }, 'invalid_image'],
    ['image with credentials', { image: 'https://u:p@images.unsplash.com/a.png' }, 'invalid_image'],
    ['javascript: image', { image: 'javascript:alert(1)' }, 'invalid_image'],
    ['data: image', { image: 'data:image/svg+xml,<svg onload=alert(1)>' }, 'invalid_image'],
    ['avatar on a foreign host', { authorName: 'Ayşe', authorAvatar: 'https://evil.example/a.png' }, 'invalid_image'],
    ['role with no name', { authorName: '', authorRole: 'Editör' }, 'invalid_author'],
    ['name too long', { authorName: 'x'.repeat(121) }, 'invalid_author'],
  ] as const)('%s → %s', (_label, patch, error) => {
    expect(validateBlogInput({ ...VALID, ...patch })).toEqual({ ok: false, error });
  });

  test('featured is true only for a literal true', () => {
    const r = validateBlogInput({ ...VALID, featured: 'on' as unknown as boolean });
    expect(r.ok && r.data.featured).toBe(false);
  });
});

describe('uploaded images (TASK-MUU20XFIXZKTE): <public base>/blog/… only', () => {
  const MINIO = 'http://localhost:9000/test-public';
  const SUPABASE = 'https://ref.supabase.co/storage/v1/object/public/blog-images';

  test.each([
    ['MinIO path-style', MINIO, `${MINIO}/blog/2026/abc.png`],
    ['Supabase Storage', SUPABASE, `${SUPABASE}/blog/2026/abc.webp`],
    ['base with a trailing slash', `${MINIO}/`, `${MINIO}/blog/2026/abc.jpg`],
  ])('accepted: %s', (_name, base, image) => {
    expect(validateBlogInput({ ...VALID, image }, base)).toMatchObject({ ok: true, data: { image } });
  });

  test.each([
    ['no public base configured', undefined, `${MINIO}/blog/2026/abc.png`],
    ['outside blog/', MINIO, `${MINIO}/evidence/abc.png`],
    ['the blog/ prefix alone', MINIO, `${MINIO}/blog/`],
    ['another bucket on the same host', MINIO, 'http://localhost:9000/test-evidence/blog/abc.png'],
    ['another port', MINIO, 'http://localhost:9001/test-public/blog/abc.png'],
    ['https for an http base', MINIO, 'https://localhost:9000/test-public/blog/abc.png'],
    ['a query string', MINIO, `${MINIO}/blog/abc.png?x=1`],
    ['credentials', MINIO, 'http://u:p@localhost:9000/test-public/blog/abc.png'],
    ['a dot-dot escape', SUPABASE, `${SUPABASE}/blog/%2e%2e/../x.png`],
  ])('refused: %s', (_name, base, image) => {
    expect(validateBlogInput({ ...VALID, image }, base)).toEqual({ ok: false, error: 'invalid_image' });
  });

  test('the unsplash covers saved before uploads keep validating with a base set', () => {
    expect(validateBlogInput(VALID, MINIO)).toMatchObject({ ok: true });
  });
});

describe('slugs', () => {
  test('a Turkish title is transliterated, not mangled', () => {
    expect(slugifyTitle('Çağrı Şartları ve Öğrenciler İçin Güncel Hibe')).toBe(
      'cagri-sartlari-ve-ogrenciler-icin-guncel-hibe'
    );
    expect(slugifyTitle('  TÜBİTAK Eşik Üstü (15 Puan)!  ')).toBe('tubitak-esik-ustu-15-puan');
  });

  test('every launch slug and every derived slug matches the pattern', () => {
    for (const post of BLOG_SEED_POSTS) {
      expect(post.slug).toMatch(BLOG_SLUG_PATTERN);
      expect(slugifyTitle(post.title)).toMatch(BLOG_SLUG_PATTERN);
    }
    expect(slugifyTitle('x '.repeat(200)).length).toBeLessThanOrEqual(120);
    expect(slugifyTitle('x '.repeat(200))).toMatch(BLOG_SLUG_PATTERN);
  });

  test('the pattern refuses what a URL segment should not carry', () => {
    for (const bad of ['Büyük', 'a b', '-a', 'a-', 'a--b', '../x', 'a/b', '']) {
      expect(BLOG_SLUG_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe('publication date', () => {
  const d = new Date('2026-08-28T00:00:00.000Z');
  test('is shown in the page locale, from the stored date', () => {
    expect(formatBlogDate(d, 'tr')).toBe('28 Ağustos 2026');
    expect(formatBlogDate(d, 'en')).toBe('28 August 2026');
  });

  test('the launch posts keep the dates they were published with', () => {
    expect(BLOG_SEED_POSTS.map((p) => formatBlogDate(p.publishedAt, 'tr'))).toEqual([
      '28 Ağustos 2026',
      '15 Ağustos 2026',
      '2 Ağustos 2026',
      '20 Temmuz 2026',
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  blogContentRefusal,
  blogImage,
  blogLinkKind,
  cleanBracketText,
  encodeContentUrl,
  isAllowedBlogImageSrc,
  isAllowedLinkHref,
} from '@/lib/blog-content-policy';
import { validateBlogInput, type BlogPostInput } from '@/lib/blog-shared';

/**
 * TASK-MVDPHZQCTVJ2R — the one rule set for links and images inside a blog
 * post. The editor, the save path and the post page all call these functions;
 * the page and the round trip are measured in tests/blog-markdown.test.tsx,
 * the save against Postgres in tests/blog-posts.live.test.ts.
 */

const BASE = 'https://cdn.example.test/storage/v1/object/public/fabrika-public';

describe('link addresses', () => {
  test.each([
    ['https://ec.europa.eu/info/funding', 'external'],
    ['http://example.org', 'external'],
    ['HTTPS://EXAMPLE.ORG/a', 'external'],
    ['mailto:info@example.org', 'mailto'],
    ['/tr/fiyatlar', 'internal'],
    ['/tr/blog/horizon-europe?x=1#top', 'internal'],
  ] as const)('%s is allowed as %s', (href, kind) => {
    expect(blogLinkKind(href)).toBe(kind);
    expect(isAllowedLinkHref(href)).toBe(true);
  });

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'javascript%3Aalert(1)',
    '%6Aavascript:alert(1)',
    'javascript&#58;alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '//evil.com',
    '//evil.com/blog/x',
    '/\\evil.com',
    '\\\\evil.com',
    'https://user:pass@evil.com',
    'https://',
    'mailto:',
    'evil.com',
    ' https://example.org',
    'https://example.org ',
    '',
    `https://example.org/${'a'.repeat(2_000)}`,
  ])('%j is refused', (href) => {
    expect(blogLinkKind(href)).toBeNull();
    expect(isAllowedLinkHref(href)).toBe(false);
  });
});

describe('image sources: uploads under <public base>/blog/ only', () => {
  test('an upload in the blog folder is allowed', () => {
    expect(isAllowedBlogImageSrc(`${BASE}/blog/2026/cabc.png`, BASE)).toBe(true);
    expect(isAllowedBlogImageSrc('http://127.0.0.1:9000/fabrika-public/blog/2026/x.webp', 'http://127.0.0.1:9000/fabrika-public')).toBe(true);
  });

  test.each([
    ['another host with a /blog/ path', 'https://evil.com/blog/x.png'],
    ['a host that starts with the bucket host', 'https://cdn.example.test.evil.com/storage/v1/object/public/fabrika-public/blog/x.png'],
    ['the bucket host as a username', `https://cdn.example.test@evil.com/storage/v1/object/public/fabrika-public/blog/x.png`],
    ['outside the blog folder', `${BASE}/evidence/x.png`],
    ['another bucket on the same host', 'https://cdn.example.test/storage/v1/object/public/other/blog/x.png'],
    ['the folder itself', `${BASE}/blog/`],
    ['a dot-dot segment', `${BASE}/blog/../secret.png`],
    ['an encoded dot-dot segment', `${BASE}/blog/%2e%2e/secret.png`],
    ['a query string', `${BASE}/blog/x.png?v=1`],
    ['a fragment', `${BASE}/blog/x.png#x`],
    ['another scheme', `http://cdn.example.test/storage/v1/object/public/fabrika-public/blog/x.png`],
    ['another port', `https://cdn.example.test:8443/storage/v1/object/public/fabrika-public/blog/x.png`],
    ['a data URI', 'data:image/png;base64,iVBORw0KGgo='],
    ['javascript', 'javascript:alert(1)'],
    ['a relative path', '/blog/x.png'],
  ])('%s is refused', (_name, src) => {
    expect(isAllowedBlogImageSrc(src, BASE)).toBe(false);
  });

  test('no public bucket: no image is allowed', () => {
    expect(isAllowedBlogImageSrc(`${BASE}/blog/x.png`, undefined)).toBe(false);
  });

  test('an image line needs alt text and nothing else on the line', () => {
    expect(blogImage(`![Grafik](${BASE}/blog/x.png)`, BASE)).toEqual({ alt: 'Grafik', src: `${BASE}/blog/x.png` });
    expect(blogImage(`![](${BASE}/blog/x.png)`, BASE)).toBeNull();
    expect(blogImage(`![   ](${BASE}/blog/x.png)`, BASE)).toBeNull();
    expect(blogImage(`metin ![Grafik](${BASE}/blog/x.png)`, BASE)).toBeNull();
    expect(blogImage(`![Grafik](${BASE}/blog/x.png) metin`, BASE)).toBeNull();
  });
});

describe('content refusals (the save path)', () => {
  test.each([
    ['plain text', 'Yalnız metin, **kalın** ve * madde.', null],
    ['an allowed link', 'Bkz. [rehber](https://example.org/a) ve [fiyatlar](/tr/fiyatlar).', null],
    ['an uploaded image with alt', `Önce\n![Grafik](${BASE}/blog/x.png)\nsonra`, null],
    ['brackets that are no link', 'Dizi [0] ve (parantez) [a] (b)', null],
    ['a javascript link', 'tıkla [x](javascript:alert(1))', 'invalid_content_link'],
    ['a link in a heading', '## [x](javascript:alert(1))', 'invalid_content_link'],
    ['a link in a list item', '* [x](//evil.com)', 'invalid_content_link'],
    ['a link in bold', '**[x](data:text/html,x)**', 'invalid_content_link'],
    ['a refused address the page would not even read as a link', '[x](javascript:alert(1)) son', 'invalid_content_link'],
    ['an attribute-breaking attempt', '[x](https://e.org/"onmouseover=alert(1))', null],
    ['an outside image', '![Grafik](https://images.unsplash.com/blog/x.png)', 'invalid_content_image'],
    ['an image without alt', `![](${BASE}/blog/x.png)`, 'invalid_content_image'],
    ['an image without a source', '![Grafik]()', 'invalid_content_image'],
  ] as const)('%s', (_name, content, refusal) => {
    expect(blogContentRefusal(content, BASE)).toBe(refusal);
  });

  const VALID: BlogPostInput = {
    title: 'Horizon Europe rehberi',
    excerpt: 'Konsorsiyum kurarken dikkat edilecekler.',
    content: '# Başlık\n\nBu içerik yirmi karakterden uzundur.',
    category: 'Horizon Europe',
    readTime: '5 dk okuma',
    image: `${BASE}/blog/cover.png`,
  };

  test('validateBlogInput applies them after the length check', () => {
    expect(validateBlogInput({ ...VALID, content: `${VALID.content}\n\n[x](javascript:alert(1))` }, BASE)).toEqual({
      ok: false,
      error: 'invalid_content_link',
    });
    expect(validateBlogInput({ ...VALID, content: `${VALID.content}\n\n![](${BASE}/blog/x.png)` }, BASE)).toEqual({
      ok: false,
      error: 'invalid_content_image',
    });
    expect(validateBlogInput({ ...VALID, content: `${VALID.content}\n\n![Grafik](${BASE}/blog/x.png)` }, BASE)).toMatchObject({
      ok: true,
    });
  });
});

describe('writing helpers', () => {
  test('bracket text loses its brackets and line breaks', () => {
    expect(cleanBracketText('a [b]\nc')).toBe('a (b) c');
  });

  test('an encoded address still parses to the same place and holds no pattern stop', () => {
    const href = 'https://example.org/a (b)*[c]';
    const encoded = encodeContentUrl(href);
    expect(encoded).toBe('https://example.org/a%20%28b%29%2A%5Bc%5D');
    expect(decodeURIComponent(new URL(encoded).pathname)).toBe('/a (b)*[c]');
    expect(isAllowedLinkHref(encoded)).toBe(true);
  });
});

describe('one policy, three callers', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

  test.each([
    ['the editor', 'src/components/editor/RichTextEditor.tsx', ['isAllowedLinkHref', 'isAllowedBlogImageSrc']],
    ['the save path', 'src/lib/blog-shared.ts', ['blogContentRefusal', 'isAllowedBlogImageSrc']],
    ['the post page', 'src/app/[locale]/(public)/blog/[slug]/page.tsx', ['blogLink', 'blogImage']],
    ['the converter', 'src/lib/blog-markdown.ts', ['blogLink', 'blogImage']],
  ])('%s imports the policy and keeps no rule of its own', (_who, file, names) => {
    const src = read(file);
    expect(src).toContain("from '@/lib/blog-content-policy'");
    for (const name of names) expect(src).toContain(name);
    expect(src).not.toContain('dangerouslySetInnerHTML');
  });
});

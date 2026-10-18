import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { BLOG_SEED_POSTS } from '@/lib/blog-seed';
import { docToMarkdown, markdownToDoc } from '@/lib/blog-markdown';
import { blogContentRefusal } from '@/lib/blog-content-policy';
import type { BlogPost } from '@/lib/blog-shared';

/**
 * TASK-MVDKHOXGRQQS5 — the admin editor loads `BlogPost.content` with
 * `markdownToDoc` and saves `docToMarkdown(editor JSON)`. A post opened and
 * saved untouched must look the same on the site, so every case below goes
 * markdown → editor doc → markdown and both strings are rendered by the REAL
 * post page (`renderBlogContent` is private to it, so the page itself is
 * rendered with its data source stubbed). Only the article body is compared.
 */

let currentContent = '';
vi.mock('@/lib/blog', () => ({
  getBlogPostBySlug: async (slug: string): Promise<BlogPost> => ({
    slug,
    title: 'T',
    excerpt: 'E',
    content: currentContent,
    category: 'C',
    readMinutes: 1,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    image: 'https://images.unsplash.com/x',
    featured: false,
  }),
  getBlogPosts: async () => [],
  formatBlogDate: () => '',
}));
// An <img> with what the page passed, so a body image can be compared.
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }) }));
// TASK-MVDPHZQCTVJ2R — the public bucket the page and the editor are handed.
const { BASE } = vi.hoisted(() => ({ BASE: 'https://cdn.example.test/pub' }));
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  publicAssetStore: () => ({ bucket: 'pub', baseUrl: BASE }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

const BlogDetailPage = (await import('@/app/[locale]/(public)/blog/[slug]/page')).default;
const realBlog = await vi.importActual<typeof import('@/lib/blog')>('@/lib/blog');

/** The rendered article body of the real post page for `content`. */
async function pageBody(content: string): Promise<string> {
  currentContent = content;
  const html = renderToStaticMarkup(await BlogDetailPage({ params: Promise.resolve({ locale: 'tr', slug: 's' }) }));
  const start = html.indexOf('<div class="prose');
  const end = html.indexOf('<div class="pt-12');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md, BASE));

const EDGE_CASES: Record<string, string> = {
  'heading directly followed by a paragraph (no blank line)': '### Başlık\nHemen ardından **kalın** paragraf.\n* madde',
  'consecutive paragraph lines join into one': 'birinci satır\nikinci satır\n\nüçüncü',
  'bullet then numbered list with no blank line': '* a\n* **b**\n1. bir\n2. iki',
  'two bullet lists split by a blank line stay two': '* a\n\n* b',
  'odd numbering is renumbered but renders the same': '3. c\n7. d',
  'indented and padded lines': '   #   Boşluklu   \n\t*  madde  ',
  'four hashes is a paragraph': '#### dört',
  'bare markers are paragraphs': '#\n*\n1.',
  'whole-line bold holding a star': '**a*b**',
  'stars that are not bold': 'a ** b *c* ***',
  'bold split across joined lines': '**başla\nbitir** son',
  'bold with inner spaces': '** iç boşluk ** ve *** üç',
  'heading with bold and a hash inside': '## **Kalın** # başlık',
  'markup stays text': '<script>window.x=1</script>\n<img src=x onerror="y">',
  'crlf and trailing blank lines': 'satır\r\n\r\n* madde\r\n\n\n',
  empty: '',
  // TASK-MVDPHZQCTVJ2R — links and images.
  'external, internal and mailto links': 'Bkz. [rehber](https://ec.europa.eu/a?b=1) ve [fiyat](/tr/fiyatlar), [yazın](mailto:a@b.org).',
  'links in a heading, a list item and bold': '## [Başlık](https://e.org)\n* [madde](/tr/blog)\n**kalın [bağ](https://e.org/x) son**',
  'refused links stay text': '[x](javascript:alert(1)) [y](//evil.com) [z](JaVaScRiPt:x) [w](data:text/html,x)',
  'an uploaded image between paragraph lines': `önce\n![Grafik](${BASE}/blog/2026/a.png)\nsonra`,
  'refused images are paragraph text': `![dış](https://evil.com/blog/x.png)\n![](${BASE}/blog/a.png)\nmetin ![ara](${BASE}/blog/a.png)`,
  'links beside parentheses and brackets': 'a [b](https://e.org) (c) [d] e](f [g]h',
  'markup attempts in a link': '[x](https://e.org/"onmouseover=alert`1`)\n[<img src=x onerror=alert(1)>](https://e.org)',
};

describe('blog markdown ↔ editor doc round trip renders the same post', () => {
  test.each(BLOG_SEED_POSTS.map((p) => [p.slug, p.content] as const))('seed post %s', async (_slug, content) => {
    expect(await pageBody(roundTrip(content))).toBe(await pageBody(content));
  });

  test.each(Object.entries(EDGE_CASES))('%s', async (_name, content) => {
    expect(await pageBody(roundTrip(content))).toBe(await pageBody(content));
  });

  test('every post in the database', async () => {
    const posts = await realBlog.getBlogPosts();
    for (const post of posts) {
      expect(await pageBody(roundTrip(post.content)), post.slug).toBe(await pageBody(post.content));
    }
  });

  test('the canonical form is stable: a second round trip changes nothing', () => {
    for (const content of [...BLOG_SEED_POSTS.map((p) => p.content), ...Object.values(EDGE_CASES)]) {
      const once = roundTrip(content);
      expect(roundTrip(once)).toBe(once);
    }
  });
});

describe('links and images on the post page (TASK-MVDPHZQCTVJ2R)', () => {
  const anchors = (body: string) => body.match(/<a [^>]*>[^<]*<\/a>/g) ?? [];

  test('an outside link opens in a new tab with no opener, referrer or endorsement', async () => {
    const [a, ...rest] = anchors(await pageBody('Bkz. [rehber](https://ec.europa.eu/a) son.'));
    expect(rest).toHaveLength(0);
    expect(a).toContain('href="https://ec.europa.eu/a"');
    expect(a).toContain('target="_blank"');
    expect(a).toContain('rel="noopener noreferrer nofollow"');
    expect(a).toContain('>rehber</a>');
  });

  test('a path on this site and a mailto link open in place', async () => {
    const [internal, mail] = anchors(await pageBody('[fiyat](/tr/fiyatlar) ve [yazın](mailto:a@b.org)'));
    expect(internal).toContain('href="/tr/fiyatlar"');
    expect(mail).toContain('href="mailto:a@b.org"');
    for (const a of [internal, mail]) {
      expect(a).not.toContain('target=');
    }
  });

  test.each([
    '[x](javascript:alert(1))',
    '[x](javascript:alert`1`)',
    '[x](JaVaScRiPt:alert`1`)',
    '[x](%6Aavascript:alert`1`)',
    '[x](//evil.com)',
    '[x](/\\evil.com)',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox)',
  ])('%s is shown as text, not as a link', async (md) => {
    const body = await pageBody(md);
    expect(anchors(body)).toHaveLength(0);
    expect(body).toContain('[x](');
  });

  test('markup inside a link stays text and no attribute can be broken out of', async () => {
    const body = await pageBody('[x](https://e.org/"onmouseover=alert`1`)\n\n[<img src=x onerror=alert(1)>](https://e.org)');
    expect(body).not.toMatch(/<a [^>]*\sonmouseover=/);
    expect(body).not.toContain('<img src="x"');
    expect(body).not.toContain('<img src=x');
    expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(body).toContain('href="https://e.org/&quot;onmouseover=alert`1`"');
  });

  test('an uploaded image with alt text is an image block; anything else is no image', async () => {
    const ok = await pageBody(`önce\n![Grafik](${BASE}/blog/2026/a.png)\nsonra`);
    expect(ok).toContain(`<img src="${BASE}/blog/2026/a.png" alt="Grafik"/>`);
    expect(ok).toContain('<p class="text-ink-2">önce</p>');
    expect(ok).toContain('<p class="text-ink-2">sonra</p>');

    const refused = await pageBody(
      [
        '![dış](https://evil.com/blog/x.png)',
        `![](${BASE}/blog/a.png)`,
        `metin ![ara](${BASE}/blog/a.png)`,
        `![taklit](https://cdn.example.test.evil.com/pub/blog/a.png)`,
        '![xss](javascript:alert(1))',
        '![b64](data:image/png;base64,iVBORw0KGgo=)',
      ].join('\n\n')
    );
    expect(refused).not.toContain('<img');
  });
});

describe('docToMarkdown writes only what the page renders', () => {
  const p = (...content: object[]) => ({ type: 'paragraph', content });
  const text = (t: string, bold = false) => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });

  test('blocks, lists as `* ` and `1. `, one blank line between blocks', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Başlık')] },
        p(text('Bir '), text('kalın', true), text(' söz.')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('a'))] }, { type: 'listItem', content: [p(text('b'))] }] },
        { type: 'orderedList', attrs: { start: 5 }, content: [{ type: 'listItem', content: [p(text('x'))] }, { type: 'listItem', content: [p(text('y'))] }] },
      ],
    });
    expect(md).toBe('## Başlık\n\nBir **kalın** söz.\n\n* a\n* b\n\n1. x\n2. y');
  });

  test('empty paragraphs, headings and list items are dropped, not written as bare markers', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        p(),
        { type: 'heading', attrs: { level: 1 } },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p()] }, { type: 'listItem', content: [p(text('dolu'))] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [p(text('  '))] }] },
      ],
    });
    expect(md).toBe('* dolu');
  });

  test('a bold run with a star inside a line loses its markers; adjacent bold runs merge', () => {
    expect(docToMarkdown({ type: 'doc', content: [p(text('x '), text('a*b', true))] })).toBe('x a*b');
    expect(docToMarkdown({ type: 'doc', content: [p(text('ka', true), text('lın', true), text(' son'))] })).toBe('**kalın** son');
  });

  test('a pasted paragraph that starts like a block still renders as that paragraph', async () => {
    const md = docToMarkdown({ type: 'doc', content: [p(text('1. Ocak toplantısı')), p(text('# * not a heading'))] });
    expect(md).toBe('1.\nOcak toplantısı\n\n#\n*\nnot a heading');
    const body = await pageBody(md);
    expect(body).toContain('<p class="text-ink-2">1. Ocak toplantısı</p>');
    expect(body).toContain('<p class="text-ink-2"># * not a heading</p>');
    expect(body).not.toMatch(/<(ol|ul|h2)/);
  });

  test('anything outside the subset (pasted or unknown nodes) is not written as markup', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        { type: 'blockquote', content: [p(text('alıntı'))] },
        p(text('italik', false), { type: 'hardBreak' }, text('\nyeni satır')),
      ],
    });
    expect(md).toBe('italik yeni satır');
  });
});

describe('docToMarkdown writes links and images the page reads back (TASK-MVDPHZQCTVJ2R)', () => {
  const p = (...content: object[]) => ({ type: 'paragraph', content });
  const link = (t: string, href: string, bold = false) => ({
    type: 'text',
    text: t,
    marks: [...(bold ? [{ type: 'bold' }] : []), { type: 'link', attrs: { href } }],
  });
  const text = (t: string, bold = false) => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });
  const image = (src: string, alt: string) => ({ type: 'image', attrs: { src, alt } });
  const md = (...content: object[]) => docToMarkdown({ type: 'doc', content });

  test('a link is `[text](href)`, inside bold too', () => {
    expect(md(p(text('Bkz. '), link('rehber', 'https://e.org/a'), text('.')))).toBe('Bkz. [rehber](https://e.org/a).');
    expect(md(p(text('kalın ', true), link('bağ', '/tr/blog', true)))).toBe('**kalın [bağ](/tr/blog)**');
  });

  test('brackets in the text and pattern stops in the address cannot break the token', async () => {
    const out = md(p(link('a [b] c', 'https://e.org/x (y)*z')));
    expect(out).toBe('[a (b) c](https://e.org/x%20%28y%29%2Az)');
    const body = await pageBody(out);
    expect(body).toContain('href="https://e.org/x%20%28y%29%2Az"');
    expect(body).toContain('>a (b) c</a>');
  });

  test('a link the page could not show is written as its text', () => {
    expect(md(p(link('tıkla', 'javascript:alert(1)')))).toBe('tıkla');
    expect(md(p(link('a*b', 'https://e.org')))).toBe('a*b');
    expect(md(p(text('x'), link('  ', 'https://e.org'), text('y')))).toBe('x  y');
  });

  test('an image is its own `![alt](src)` block; an empty alt is written and the save refuses it', () => {
    const out = md(p(text('önce')), image(`${BASE}/blog/a.png`, 'Gra[fik]'), p(text('sonra')));
    expect(out).toBe(`önce\n\n![Gra(fik)](${BASE}/blog/a.png)\n\nsonra`);
    expect(blogContentRefusal(out, BASE)).toBeNull();
    const noAlt = md(image(`${BASE}/blog/a.png`, ' '));
    expect(noAlt).toBe(`![](${BASE}/blog/a.png)`);
    expect(blogContentRefusal(noAlt, BASE)).toBe('invalid_content_image');
  });

  test('markdownToDoc reads links and images the way the page does', () => {
    expect(markdownToDoc(`[a](https://e.org) [b](javascript:x)\n\n![Alt](${BASE}/blog/a.png)\n\n![Dış](https://evil.com/blog/a.png)`, BASE)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://e.org' } }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: '[b](javascript:x)' },
          ],
        },
        { type: 'image', attrs: { alt: 'Alt', src: `${BASE}/blog/a.png` } },
        // Not an image: as on the page, a `!` and an ordinary https link (the save refuses the line).
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '!' },
            { type: 'text', text: 'Dış', marks: [{ type: 'link', attrs: { href: 'https://evil.com/blog/a.png' } }] },
          ],
        },
      ],
    });
    // Without a public bucket no line is an image.
    expect(markdownToDoc(`![Alt](${BASE}/blog/a.png)`).content[0]?.type).toBe('paragraph');
  });
});

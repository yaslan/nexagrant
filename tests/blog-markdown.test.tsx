import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { BLOG_SEED_POSTS } from '@/lib/blog-seed';
import { docToMarkdown, markdownToDoc } from '@/lib/blog-markdown';
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
    readTime: '1',
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    image: 'https://images.unsplash.com/x',
    featured: false,
  }),
  getBlogPosts: async () => [],
  formatBlogDate: () => '',
}));
vi.mock('next/image', () => ({ default: () => null }));

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

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md));

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

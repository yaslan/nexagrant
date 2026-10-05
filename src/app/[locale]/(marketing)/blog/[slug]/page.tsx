import type { Metadata } from 'next';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { formatBlogDate, getBlogPostBySlug, getBlogPosts } from '@/lib/blog';
import { getPublicRoute } from '@/lib/routes';
import { appUrl } from '@/lib/app-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    return { title: 'Not found' };
  }

  const baseUrl = appUrl();
  const canonicalUrl = `${baseUrl}/${locale}/blog/${slug}`;
  const publishedDate = post.publishedAt;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'tr': `${baseUrl}/tr/blog/${slug}`,
        'en': `${baseUrl}/en/blog/${slug}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: canonicalUrl,
      images: [{ url: post.image, alt: post.title }],
      publishedTime: publishedDate?.toISOString(),
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.excerpt },
  };
}

/**
 * Renders `**bold**` spans inside a line of already-escaped React text.
 * No HTML is produced — only <strong> elements — so admin-authored post
 * content can never inject markup via this path.
 */
function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

/**
 * Post content is stored as plain markdown text (BlogPost.content) with no
 * blank line guaranteed between a heading and the paragraph or list that
 * follows it, so blocks are built line-by-line rather than by splitting on
 * '\n\n' — a block split let a `### heading` swallow the rest of its
 * paragraph, literal `**`/`*` included, into the heading text.
 */
function renderBlogContent(content: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={blocks.length} className="text-ink-2">
        {renderInline(paragraphLines.join(' '))}
      </p>
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    const items = listItems;
    blocks.push(
      listType === 'ul' ? (
        <ul key={blocks.length} className="list-disc pl-5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-ink-2">{renderInline(item)}</li>
          ))}
        </ul>
      ) : (
        <ol key={blocks.length} className="list-decimal pl-5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-ink-2">{renderInline(item)}</li>
          ))}
        </ol>
      )
    );
    listItems = [];
    listType = null;
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    // Each pattern below has exactly one group, `(.*)`, which is not optional
    // and matches the empty string — so on a successful match group 1 always
    // participated. `?? ''` states that for the compiler without an assertion.
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const ulItem = line.match(/^\*\s+(.*)$/);
    const olItem = line.match(/^\d+\.\s+(.*)$/);

    if (h3) {
      flushParagraph();
      flushList();
      blocks.push(
        <h4 key={blocks.length} className="text-lg font-bold text-accent font-heading pt-2">
          {renderInline(h3[1] ?? '')}
        </h4>
      );
    } else if (h2) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={blocks.length} className="text-xl font-bold text-ink font-heading pt-3 pb-1">
          {renderInline(h2[1] ?? '')}
        </h3>
      );
    } else if (h1) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={blocks.length} className="text-2xl font-bold text-ink font-heading pt-4 pb-2 border-b border-border">
          {renderInline(h1[1] ?? '')}
        </h2>
      );
    } else if (ulItem) {
      flushParagraph();
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ulItem[1] ?? '');
    } else if (olItem) {
      flushParagraph();
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(olItem[1] ?? '');
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();

  return blocks;
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const isTr = locale === 'tr';
  const relatedPosts = (await getBlogPosts()).filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      <PublicNavbar locale={locale} />

      <main className="flex-1 py-12 lg:py-20">
        <article className="max-w-4xl mx-auto px-edge sm:px-6 lg:px-8 space-y-8">
          {/* Back link */}
          <div>
            <Link
              href={getPublicRoute('blog', locale)}
              className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline bg-surface border border-border px-3 py-1.5 rounded-lg shadow-2xs"
            >
              <span>←</span>
              <span>{isTr ? 'Tüm Blog Yazılarına Dön' : 'Back to Blog'}</span>
            </Link>
          </div>

          {/* Post Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="bg-accent/15 text-accent-ink border border-accent/20 text-xs font-bold px-3 py-1 rounded-full">
                {post.category}
              </span>
              <time dateTime={post.publishedAt.toISOString()} className="text-xs text-muted font-medium">
                {formatBlogDate(post.publishedAt, locale)}
              </time>
              <span className="text-xs text-muted font-medium">• {post.readTime}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading text-ink leading-tight">
              {post.title}
            </h1>

            {/* Author Badge — rendered only for a post that records an author. */}
            {post.author && (
              <div className="flex items-center gap-3 pt-2">
                {post.author.avatar && (
                  <Image
                    src={post.author.avatar}
                    alt={post.author.name}
                    width={40}
                    height={40}
                    className="rounded-full object-cover border border-border"
                  />
                )}
                <div>
                  <div className="text-sm font-bold text-ink">{post.author.name}</div>
                  <div className="text-xs text-muted">{post.author.role}</div>
                </div>
              </div>
            )}
          </div>

          {/* Hero Cover Image */}
          <div className="relative rounded-2xl overflow-hidden border border-border shadow-md h-80 sm:h-96 w-full">
            <Image
              src={post.image}
              alt={post.title}
              fill
              className="object-cover"
            />
          </div>

          {/* Article Content */}
          <div className="prose prose-slate dark:prose-invert max-w-none bg-surface border border-border rounded-2xl p-6 sm:p-10 shadow-xs text-sm sm:text-base leading-relaxed space-y-4">
            {renderBlogContent(post.content)}
          </div>

          {/* Related Articles */}
          <div className="pt-12 border-t border-border space-y-6">
            <h3 className="text-xl font-bold text-ink font-heading">
              {isTr ? 'İlginizi Çekebilecek Diğer Yazılar' : 'Related Articles'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedPosts.map((rel) => (
                <Link
                  key={rel.slug}
                  href={getPublicRoute('blogDetail', locale, rel.slug)}
                  className="bg-surface border border-border rounded-xl p-5 shadow-2xs hover:border-accent hover:shadow-md transition-all flex flex-col justify-between space-y-3 group"
                >
                  <span className="text-xs font-bold text-accent">{rel.category}</span>
                  <h4 className="font-bold text-base text-ink group-hover:text-accent transition-colors leading-snug">
                    {rel.title}
                  </h4>
                  <p className="text-xs text-muted line-clamp-2">{rel.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </article>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}

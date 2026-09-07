import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { getBlogPostBySlug, getBlogPosts } from '@/lib/blog';
import { getPublicRoute } from '@/lib/routes';

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const isTr = locale === 'tr';
  const relatedPosts = getBlogPosts().filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      <PublicNavbar locale={locale} />

      <main className="flex-1 py-12 lg:py-20">
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
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
              <span className="text-xs text-muted font-medium">{post.publishedAt}</span>
              <span className="text-xs text-muted font-medium">• {post.readTime}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading text-ink leading-tight">
              {post.title}
            </h1>

            {/* Author Badge */}
            <div className="flex items-center gap-3 pt-2">
              <Image
                src={post.author.avatar}
                alt={post.author.name}
                width={40}
                height={40}
                className="rounded-full object-cover border border-border"
              />
              <div>
                <div className="text-sm font-bold text-ink">{post.author.name}</div>
                <div className="text-xs text-muted">{post.author.role}</div>
              </div>
            </div>
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
            {post.content.split('\n\n').map((paragraph, index) => {
              if (paragraph.startsWith('# ')) {
                return (
                  <h2 key={index} className="text-2xl font-bold text-ink font-heading pt-4 pb-2 border-b border-border">
                    {paragraph.replace('# ', '')}
                  </h2>
                );
              }
              if (paragraph.startsWith('## ')) {
                return (
                  <h3 key={index} className="text-xl font-bold text-ink font-heading pt-3 pb-1">
                    {paragraph.replace('## ', '')}
                  </h3>
                );
              }
              if (paragraph.startsWith('### ')) {
                return (
                  <h4 key={index} className="text-lg font-bold text-accent font-heading pt-2">
                    {paragraph.replace('### ', '')}
                  </h4>
                );
              }
              return (
                <p key={index} className="text-ink-2">
                  {paragraph}
                </p>
              );
            })}
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

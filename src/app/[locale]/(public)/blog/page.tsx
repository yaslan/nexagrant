import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { authorByline, formatBlogDate, getBlogPosts } from '@/lib/blog';
import { getPublicRoute } from '@/lib/routes';
import { appUrl } from '@/lib/app-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const title = t('meta_title');
  const description = t('meta_description');

  const baseUrl = appUrl();
  const canonicalUrl = `${baseUrl}/${locale}/blog`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'tr': `${baseUrl}/tr/blog`,
        'en': `${baseUrl}/en/blog`,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: canonicalUrl,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function BlogIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const posts = await getBlogPosts();
  const t = await getTranslations({ locale, namespace: 'blog' });
  const isTr = locale === 'tr';

  return (
    <div className="flex-1 flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      <main className="flex-1 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8 space-y-12">
          {/* Page Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3.5 py-1.5 rounded-full">
              {isTr ? 'Bilgi & Rehber Portalı' : 'Knowledge & Insights'}
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold font-heading text-ink tracking-tight">
              {isTr
                ? 'AB Proje Yönetimi & Hibe Blogu'
                : 'EU Grant Management & Insights Blog'}
            </h1>
            <p className="text-sm sm:text-base text-muted leading-relaxed">
              {isTr
                ? 'Horizon Europe, CORDIS analitiği, AB hakem değerlendirme kriterleri ve yapay zeka destekli teklif hazırlama rehberleri.'
                : 'Expert articles, Horizon Europe methodologies, CORDIS network graph analysis, and AI proposal writing tips.'}
            </p>
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="bg-surface border border-border rounded-2xl overflow-hidden shadow-xs hover:shadow-xl hover:border-accent/40 transition-all flex flex-col group"
              >
                {/* Image */}
                <div className="relative h-52 w-full overflow-hidden bg-muted/20">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="bg-surface/90 backdrop-blur-md border border-border text-ink text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-2xs">
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-[11px] text-muted font-medium">
                      <time dateTime={post.publishedAt.toISOString()}>{formatBlogDate(post.publishedAt, locale)}</time>
                      <span>•</span>
                      <span>{t('readMinutes', { min: post.readMinutes })}</span>
                    </div>

                    <h2 className="font-bold text-lg text-ink font-heading group-hover:text-accent transition-colors leading-snug">
                      <Link href={getPublicRoute('blogDetail', locale, post.slug)}>
                        {post.title}
                      </Link>
                    </h2>

                    <p className="text-xs text-ink-2 leading-relaxed line-clamp-3">
                      {post.excerpt}
                    </p>
                  </div>

                  {/* Author Badge & Button */}
                  <div className="pt-4 border-t border-border/80 flex items-center justify-between">
                    {/* Byline only when the post records one — see src/lib/blog.ts. */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {post.author ? (
                        <>
                          {post.author.avatar && (
                            <Image
                              src={post.author.avatar}
                              alt={authorByline(post.author)}
                              width={28}
                              height={28}
                              className="rounded-full object-cover border border-border"
                            />
                          )}
                          <div className="min-w-0 text-xs font-semibold text-ink leading-none truncate">
                            {authorByline(post.author)}
                          </div>
                        </>
                      ) : null}
                    </div>

                    <Link
                      href={getPublicRoute('blogDetail', locale, post.slug)}
                      className="shrink-0 text-xs font-bold text-accent hover:underline flex items-center gap-1"
                    >
                      <span>{isTr ? 'Devamını Oku' : 'Read Article'}</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { getBlogPosts } from '@/lib/blog';
import { getPublicRoute } from '@/lib/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const title = t('meta_title');
  const description = t('meta_description');

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/blog`,
      languages: {
        'tr': '/tr/blog',
        'en': '/en/blog',
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/blog`,
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
  const posts = getBlogPosts();
  const isTr = locale === 'tr';

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      <PublicNavbar locale={locale} />

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
                      <span>{post.publishedAt}</span>
                      <span>•</span>
                      <span>{post.readTime}</span>
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
                    <div className="flex items-center gap-2.5">
                      {post.author ? (
                        <>
                          {post.author.avatar && (
                            <Image
                              src={post.author.avatar}
                              alt={post.author.name}
                              width={28}
                              height={28}
                              className="rounded-full object-cover border border-border"
                            />
                          )}
                          <div>
                            <div className="text-xs font-semibold text-ink leading-none">{post.author.name}</div>
                            <div className="text-[10px] text-muted mt-0.5">{post.author.role}</div>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <Link
                      href={getPublicRoute('blogDetail', locale, post.slug)}
                      className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
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

      <PublicFooter locale={locale} />
    </div>
  );
}

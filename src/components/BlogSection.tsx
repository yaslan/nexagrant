import React from 'react';
import Link from 'next/link';
import { getFeaturedBlogPosts } from '@/lib/blog';
import { getPublicRoute } from '@/lib/routes';

interface BlogSectionProps {
  locale: string;
}

export default function BlogSection({ locale }: BlogSectionProps) {
  const posts = getFeaturedBlogPosts(3);
  const isTr = locale === 'tr';

  return (
    <section className="py-20 lg:py-28 bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
          <div>
            <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
              {isTr ? 'Bilgi & Rehber Deposu' : 'Knowledge & Insights'}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink mt-3">
              {isTr
                ? 'AB Hibe Ekosistemi & Proje Yönetimi Blogu'
                : 'EU Grant Ecosystem & Proposal Insights'}
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-2 max-w-xl">
              {isTr
                ? 'Horizon Europe, CORDIS analitiği, AB hakem değerlendirme sırları ve yapay zeka destekli teklif hazırlama teknikleri.'
                : 'Expert analysis, Horizon Europe methodologies, CORDIS intelligence, and AI-assisted proposal writing.'}
            </p>
          </div>

          <Link
            href={getPublicRoute('blog', locale)}
            className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline bg-ground border border-border px-4 py-2.5 rounded-xl shadow-2xs hover:bg-surface-hover transition shrink-0"
          >
            <span>{isTr ? 'Tüm Blog Yazılarını Gör' : 'Explore All Articles'}</span>
            <span>→</span>
          </Link>
        </div>

        {/* 3 Blog Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="bg-ground/60 border border-border rounded-2xl overflow-hidden shadow-xs hover:shadow-xl hover:border-accent/40 transition-all flex flex-col group"
            >
              {/* Cover Image */}
              <div className="relative h-48 w-full overflow-hidden bg-muted/20">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 left-3">
                  <span className="bg-surface/90 backdrop-blur-md border border-border text-ink text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-2xs">
                    {post.category}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted font-medium">
                    <span>{post.publishedAt}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>

                  <h3 className="font-bold text-lg text-ink font-heading group-hover:text-accent transition-colors leading-snug">
                    <Link href={getPublicRoute('blogDetail', locale, post.slug)}>
                      {post.title}
                    </Link>
                  </h3>

                  <p className="text-xs text-ink-2 leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>

                {/* Author Badge & Read More Button */}
                <div className="pt-4 border-t border-border/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={post.author.avatar}
                      alt={post.author.name}
                      className="w-7 h-7 rounded-full object-cover border border-border"
                    />
                    <div>
                      <div className="text-xs font-semibold text-ink leading-none">{post.author.name}</div>
                      <div className="text-[10px] text-muted mt-0.5">{post.author.role}</div>
                    </div>
                  </div>

                  <Link
                    href={getPublicRoute('blogDetail', locale, post.slug)}
                    className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
                  >
                    <span>{isTr ? 'Oku' : 'Read'}</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

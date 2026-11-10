import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { appUrl } from '@/lib/app-url';
import { getBlogPosts } from '@/lib/blog';
import { blogContentShownIn } from '@/lib/blog-shared';

// Hardcoded regions matching src/app/[locale]/(public)/calls/[region]/regions.ts
const REGIONS: Record<string, { name: string; code: string }> = {
  turkey: { name: 'Türkiye', code: 'TR' },
  germany: { name: 'Almanya', code: 'DE' },
  belgium: { name: 'Belçika', code: 'BE' },
  france: { name: 'Fransa', code: 'FR' },
  italy: { name: 'İtalya', code: 'IT' },
};

export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = appUrl();
  const locales = ['tr', 'en'];

  const entries: MetadataRoute.Sitemap = [];

  // 1. Static public pages
  const staticRoutes: Record<string, { path: string; priority: number }[]> = {
    tr: [
      { path: '', priority: 0.8 },
      { path: '/fiyatlandirma', priority: 0.7 },
      { path: '/gizlilik-politikasi', priority: 0.5 },
      { path: '/kullanim-kosullari', priority: 0.5 },
      { path: '/veri-isleme-sozlesmesi', priority: 0.5 },
      { path: '/turkiyeye-acik-cagrilar', priority: 0.7 },
      { path: '/uzman', priority: 0.7 },
      { path: '/blog', priority: 0.6 },
    ],
    en: [
      { path: '', priority: 0.8 },
      { path: '/pricing', priority: 0.7 },
      { path: '/privacy', priority: 0.5 },
      { path: '/terms', priority: 0.5 },
      { path: '/dpa', priority: 0.5 },
      { path: '/open-calls', priority: 0.7 },
      { path: '/experts', priority: 0.7 },
      // No '/blog': the posts are Turkish only and /en/blog is a noindex notice (NG-121).
    ],
  };

  for (const locale of locales) {
    for (const { path, priority } of staticRoutes[locale] ?? []) {
      entries.push({
        url: `${baseUrl}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority,
      });
    }
  }

  // 2. Region-based calls pages
  for (const locale of locales) {
    for (const region of Object.keys(REGIONS)) {
      entries.push({
        url: `${baseUrl}/${locale}/calls/${region}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  }

  // 3. Blog posts — only on the locale they are written in (NG-121): BlogPost
  // is single-language Turkish, /en/blog/<slug> redirects to the Turkish page.
  // Query failures are silently skipped to prevent deployment failures when the
  // database is temporarily unavailable. Incomplete sitemap entries are acceptable;
  // search engines will fetch the page anyway if referenced elsewhere.
  try {
    const blogPosts = await getBlogPosts();
    for (const post of blogPosts) {
      for (const locale of locales.filter(blogContentShownIn)) {
        entries.push({
          url: `${baseUrl}/${locale}/blog/${post.slug}`,
          lastModified: post.publishedAt,
          changeFrequency: 'monthly',
          priority: 0.5,
        });
      }
    }
  } catch (err) {
    console.error('[sitemap] getBlogPosts failed:', err);
  }

  // 4. Open calls (individual topics) — OPEN status only
  // Query failures are silently skipped to prevent deployment failures when the
  // database is temporarily unavailable. Incomplete sitemap entries are acceptable;
  // search engines will fetch the page anyway if referenced elsewhere.
  try {
    const openTopics = await prisma.topic.findMany({
      where: { status: 'OPEN' },
      select: { identifier: true, updatedAt: true },
      take: 5000, // Safety limit
    });

    for (const topic of openTopics) {
      for (const locale of locales) {
        entries.push({
          url: `${baseUrl}/${locale}/calls/topic/${encodeURIComponent(topic.identifier)}`,
          lastModified: topic.updatedAt,
          changeFrequency: 'daily',
          priority: 0.7,
        });
      }
    }
  } catch (err) {
    console.error('[sitemap] Topic.findMany failed:', err);
  }

  return entries;
}

import { getTranslations } from 'next-intl/server';
import React from 'react';
import Link from 'next/link';
import { BLOG_CONTENT_LOCALE } from '@/lib/blog-shared';
import { getPublicRoute } from '@/lib/routes';

/**
 * NG-121 — stands in for the post list on a locale the posts are not written in
 * (src/lib/blog-shared.ts blogContentShownIn): a short notice and a link to the
 * Turkish blog, instead of Turkish titles and excerpts on an English page.
 */
export default async function BlogTurkishOnlyNotice({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'blog' });
  return (
    <div
      data-testid="blog-turkish-only"
      className="max-w-2xl mx-auto text-center bg-surface border border-border rounded-2xl p-8 shadow-xs space-y-3"
    >
      <h2 className="text-lg font-bold font-heading text-ink">{t('onlyTurkishTitle')}</h2>
      <p className="text-sm text-ink-2 leading-relaxed">{t('onlyTurkishBody')}</p>
      <Link
        href={getPublicRoute('blog', BLOG_CONTENT_LOCALE)}
        hrefLang={BLOG_CONTENT_LOCALE}
        className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline"
      >
        <span>{t('onlyTurkishLink')}</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

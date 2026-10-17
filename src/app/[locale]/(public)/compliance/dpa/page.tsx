import React from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { MarkdownView } from './markdown-view';

/**
 * Legal pages get shared publicly, so this carries its own Open Graph tags.
 * Copy lives in messages/{tr,en}.json under `legal.dpa`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.dpa' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/compliance/dpa` },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/compliance/dpa`,
    },
    twitter: { card: 'summary', title, description },
  };
}

/** Renders the DPA from `docs/legal/dpa-{locale}.md` so legal text stays out of the code. */
export default async function DpaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isTr = locale === 'tr';
  const file = isTr ? 'dpa-tr.md' : 'dpa-en.md';

  let source: string;
  try {
    source = await fs.readFile(path.join(process.cwd(), 'docs', 'legal', file), 'utf8');
  } catch {
    source = isTr
      ? '# Veri İşleme Sözleşmesi\n\nBelge şu anda kullanılamıyor.'
      : '# Data Processing Agreement\n\nThis document is currently unavailable.';
  }

  return (
    <main id="main" className="flex-1">
      <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8">
        <article className="prose prose-slate max-w-none">
          <MarkdownView source={source} />
        </article>
      </div>
    </main>
  );
}

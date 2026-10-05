import React from 'react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { READINESS_ORG_TYPES } from '@/lib/readiness/score';
import { parseShareQuery, readinessPath } from '@/lib/readiness/share';
import ReadinessCheck from './readiness-check';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'readiness' });
  const url = readinessPath(locale);

  return {
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: { canonical: url },
    openGraph: {
      title: t('meta_title'),
      description: t('meta_description'),
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url,
    },
  };
}

export default async function FonHazirlikPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const shared = parseShareQuery(
    { get: (name) => (typeof query[name] === 'string' ? query[name] : null) },
    READINESS_ORG_TYPES,
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      <div className="print:hidden">
        <PublicNavbar locale={locale} />
      </div>

      <main id="main" className="flex-1 max-w-3xl mx-auto w-full px-edge sm:px-4 py-8 sm:py-12">
        <ReadinessCheck locale={locale} shared={shared} />
      </main>

      <div className="print:hidden">
        <PublicFooter locale={locale} />
      </div>
    </div>
  );
}

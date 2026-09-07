import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import PricingClient from './PricingClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/pricing` },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/pricing`,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PricingPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PricingClient locale={locale} />;
}

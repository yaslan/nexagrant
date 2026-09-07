import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import PricingClient from './PricingClient';
import { getActiveTier } from '@/lib/billing/active-tier';

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
  // The running campaign is a server decision (`BILLING_ACTIVE_TIER`), the same
  // one `/api/billing/checkout` prices under. The page renders it; it never
  // picks one.
  return <PricingClient locale={locale} activeTier={getActiveTier()} />;
}

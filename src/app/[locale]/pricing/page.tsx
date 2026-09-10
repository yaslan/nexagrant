import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import React from 'react';
import PricingClient from './PricingClient';
import { auth } from '@/lib/auth';
import { getActiveTier } from '@/lib/billing/active-tier';
import { DISCOUNT_TIERS, NO_DISCOUNT_TIER } from '@/lib/billing/catalog';
import { countLifetimeLicences, lifetimeScarcity } from '@/lib/billing/lifetime-licence';
import { readStorefront } from '@/lib/billing/storefront';

/**
 * The scarcity badge counts rows, so the page cannot be baked at build time —
 * a cached "19 owners" is how the 21st licence gets sold.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

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
  //
  // Same rule for the lifetime scarcity badge: the count comes from
  // `LifetimeLicence` rows, and when it cannot be read the state is `unknown`
  // and the badge claims no number — it is not silently zero.
  const scarcity = lifetimeScarcity(await countLifetimeLicences());
  const activeTier = getActiveTier();

  // The plan cards, priced here rather than in the browser (TASK-MTSHVKTSGC8A4).
  //
  // Two things move by doing it on the server. The figures now come from the
  // published `PlanVersion` rows the plan studio writes, so a price published
  // in the studio is the price this page quotes and `/api/billing/checkout`
  // charges — until this task the page read a static array and the studio's
  // price reached nobody. And a visitor who is signed in sees the plans that
  // are visible *to their tenant*: the public list plus any private plan
  // assigned to them, and no private plan that was not.
  //
  // A visitor with no session is anonymous here on purpose — the public list is
  // what a stranger may see.
  const session = await auth();
  const storefront = await readStorefront(
    session?.tenantId ?? null,
    activeTier,
    NO_DISCOUNT_TIER,
    DISCOUNT_TIERS
  );

  return (
    <PricingClient
      locale={locale}
      activeTier={activeTier}
      lifetimeScarcity={scarcity}
      plans={storefront.cards}
      tierSchedule={storefront.schedule}
      plansMeasured={storefront.measured}
    />
  );
}

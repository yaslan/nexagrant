import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * Legal pages get shared publicly, so they carry their own title, description
 * and Open Graph tags per locale instead of falling back to the app-wide
 * defaults. Copy lives in messages/{tr,en}.json under `legal.terms`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/terms` },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/terms`,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function TermsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });

  const sections = [
    { heading: 'scopeHeading', body: 'scopeBody' },
    { heading: 'contentHeading', body: 'contentBody' },
    { heading: 'acceptableUseHeading', body: 'acceptableUseBody' },
    { heading: 'billingHeading', body: 'billingBody' },
    { heading: 'refundHeading', body: 'refundBody' },
    { heading: 'trialHeading', body: 'trialBody' },
    { heading: 'terminationHeading', body: 'terminationBody' },
    { heading: 'agencyHeading', body: 'agencyBody' },
    { heading: 'partnerHeading', body: 'partnerBody' },
    { heading: 'intellectualPropertyHeading', body: 'intellectualPropertyBody' },
    { heading: 'changesHeading', body: 'changesBody' },
    { heading: 'contactHeading', body: 'contactBody' },
  ];

  return (
    <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {t('heading')}
      </h1>

      <div className="prose prose-slate max-w-none text-ink-2 space-y-6">
        {sections.map((section, idx) => (
          <section key={idx}>
            <h2 className="text-xl font-bold text-ink mb-2">
              {t(section.heading)}
            </h2>
            <p>
              {t(section.body, { brand: PRODUCT_NAME })}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

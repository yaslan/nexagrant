import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { getWorkspaceRoute } from '@/lib/routes';

/**
 * Legal pages get shared publicly, so they carry their own title, description
 * and Open Graph tags per locale instead of falling back to the app-wide
 * defaults. Copy lives in messages/{tr,en}.json under `legal.privacy`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/privacy` },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/privacy`,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PrivacyPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });

  // CLAUDE.md §8 — this notice used to hold both language versions as inline
  // `isTr ? '…' : '…'` ternaries, so the legal copy was invisible to the i18n
  // tooling and could not be revised without a code change. It now reads the
  // same keys the metadata above already declared it would.
  const sections = [
    { heading: t('controllerHeading'), body: t('controllerBody', { brand: PRODUCT_NAME }) },
    { heading: t('dataHeading'), body: t('dataBody') },
    { heading: t('rightsHeading'), body: t('rightsBody'), href: getWorkspaceRoute('settingsPrivacy', locale, 'default') },
    { heading: t('securityHeading'), body: t('securityBody') },
  ];

  return (
    <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">{t('heading')}</h1>

      <div className="prose prose-slate max-w-none text-ink-2 space-y-6">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold text-ink mb-2">{section.heading}</h2>
            <p>{section.body}</p>
            {section.href && (
              <p className="mt-2">
                <Link href={section.href} className="text-accent underline hover:no-underline">
                  {t('rightsLink')}
                </Link>
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

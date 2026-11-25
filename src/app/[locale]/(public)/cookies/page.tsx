import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import LegalDraftNotice from '@/components/LegalDraftNotice';
import CookiePreferencesButton from '@/components/CookiePreferencesButton';
import { buttonClass } from '@/components/ui/Button';
import { OPTIONAL_COOKIE_CATEGORIES } from '@/lib/cookie-consent';

/**
 * NG-9 (FE-1.5) — the cookie policy page. A placeholder until legal supplies the text:
 * it names the categories the banner offers (what the code actually does) and says
 * plainly that the policy itself is a draft. No legal wording is written here.
 * Copy: messages/{tr,en}.json `legal.cookies`.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.cookies' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/cookies` },
    openGraph: { title, description, type: 'article', locale: locale === 'tr' ? 'tr_TR' : 'en_GB', url: `/${locale}/cookies` },
    twitter: { card: 'summary', title, description },
  };
}

const CATEGORIES = ['necessary', ...OPTIONAL_COOKIE_CATEGORIES] as const;

export default async function CookiePolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.cookies' });
  const tc = await getTranslations({ locale, namespace: 'legal.cookieConsent' });

  return (
    <main id="main" className="flex-1">
      <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8 min-w-0">
        <LegalDraftNotice locale={locale} />
        <h1 className="text-3xl font-bold font-heading mb-6 text-ink">{t('heading')}</h1>
        <div className="text-ink-2 space-y-6">
          <p data-testid="cookie-policy-placeholder">{t('placeholder')}</p>
          <section>
            <h2 className="text-xl font-bold text-ink mb-3">{t('categoriesHeading')}</h2>
            <dl className="divide-y divide-border border-y border-border">
              {CATEGORIES.map((category) => (
                <div key={category} className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                  <dt className="font-semibold text-ink">{tc(`categories.${category}.name`)}</dt>
                  <dd className="mt-1 sm:col-span-2 sm:mt-0 text-sm">{tc(`categories.${category}.description`)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h2 className="text-xl font-bold text-ink mb-2">{t('changeHeading')}</h2>
            <p className="mb-4">{t('changeBody')}</p>
            <CookiePreferencesButton className={buttonClass('secondary', 'md')} />
          </section>
        </div>
      </div>
    </main>
  );
}

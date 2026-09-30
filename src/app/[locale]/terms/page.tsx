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
  const isTr = locale === 'tr';
  const t = await getTranslations({ locale, namespace: 'legal.terms' });

  return (
    <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {isTr ? 'Kullanım Koşulları ve Hizmet Sözleşmesi' : 'Terms of Service'}
      </h1>
      
      <div className="prose prose-slate max-w-none text-ink-2 space-y-6">
        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '1. Hizmetin Tanımı ve Kapsamı' : '1. Service Scope'}
          </h2>
          <p>
            {t('scopeBody', { brand: PRODUCT_NAME })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '2. Yapay Zeka Çıktıları ve Sorumluluk' : '2. AI Generated Content'}
          </h2>
          <p>
            {isTr 
              ? 'Sistem tarafından üretilen konsept notlar ve metin taslakları karar destek niteliğindedir. Başvuru sahibinin resmi teslim öncesinde metinleri doğrulama ve etik kurallara uyumunu denetleme yükümlülüğü bulunmaktadır.'
              : 'AI-generated concept notes and sections are intended as decision support drafts. The applicant holds sole responsibility for final review, factual correctness, and compliance with grant authority guidelines.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '3. Abonelik, Krediler ve İptal' : '3. Subscriptions & Credits'}
          </h2>
          <p>
            {isTr 
              ? 'Abonelikler seçilen dönem başında tahsil edilir. Kullanılmayan yapay zeka kredileri plan yenilemesinde güncellenir. Müşteri portalı üzerinden abonelik istenildiğinde iptal edilebilir.'
              : 'Subscriptions are billed in advance per billing cycle. AI credits are granted per plan entitlements and may be cancelled anytime via the Stripe Customer Portal.'}
          </p>
        </section>
      </div>
    </div>
  );
}

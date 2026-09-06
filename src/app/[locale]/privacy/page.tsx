import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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
  const title = t('metaTitle');
  const description = t('metaDescription');

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
  const isTr = locale === 'tr';

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 bg-surface border rounded-xl my-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {isTr ? 'Gizlilik Politikası ve KVKK Aydınlatma Metni' : 'Privacy Policy & GDPR Disclosure'}
      </h1>
      
      <div className="prose prose-slate max-w-none text-ink-2 space-y-6">
        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '1. Veri Sorumlusu' : '1. Data Controller'}
          </h2>
          <p>
            {isTr 
              ? 'FonBridge SaaS Platformu olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve AB Genel Veri Koruma Tüzüğü (“GDPR”) uyarınca kişisel verilerinizin güvenliğine azami özen göstermekteyiz.'
              : 'FonBridge SaaS Platform, in compliance with GDPR and applicable national laws, prioritizes the security and privacy of all user data.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '2. İşlenen Veriler ve Toplama Amaçları' : '2. Data Processed & Collection Purposes'}
          </h2>
          <p>
            {isTr
              ? 'Kullanıcı hesabı açma, oturum doğrulama, AB hibe çağrılarıyla eşleştirme, yapay zeka destekli teklif taslağı oluşturma ve abonelik faturalandırması süreçlerinde ad, e-posta, şirket/kurum bilgileri ve ödeme kayıtları işlenmektedir.'
              : 'Account registration, session authentication, EU funding call matching, AI-assisted concept note drafting, and subscription billing processes involve processing names, emails, organization profiles, and payment metadata.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '3. Veri Sahibi Hakları (Dışa Aktarma ve Silme)' : '3. Data Subject Rights (Export & Deletion)'}
          </h2>
          <p>
            {isTr
              ? 'KVKK 11. maddesi ve GDPR uyarınca verilerinizi dilediğiniz an “Ayarlar → Gizlilik ve Verilerim” ekranından JSON biçiminde dışa aktarabilirsiniz. Aynı ekrandan hesabınızın silinmesini talep edebilirsiniz: hesabınız derhal erişime kapatılır ve 30 gün sonra tüm verileriniz ile yüklediğiniz belgeler kalıcı olarak silinir. Bu 30 günlük süre içinde talebinizi iptal edebilirsiniz. Güvenlik gereği dışa aktarım dosyasına kimlik doğrulama anahtarları (OAuth ve oturum jetonları) dahil edilmez.'
              : 'Under GDPR and applicable data protection law, you can export your data as JSON at any time from “Settings → Privacy & My Data”. From the same screen you can request deletion of your account: it is closed immediately and all of your data and uploaded files are permanently deleted after 30 days. You may cancel the request within that 30-day window. For security, authentication secrets (OAuth and session tokens) are excluded from the export file.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? '4. Güvenlik ve Depolama' : '4. Security and Storage'}
          </h2>
          <p>
            {isTr
              ? 'Verileriniz çok kiracılı veritabanında PostgreSQL Row-Level Security (RLS) ile diğer kiracılardan mutlak surette yalıtılmış olup, dosya ekleriniz şifreli bulut depolama (R2/S3) üzerinde saklanır.'
              : 'Your data is strictly partitioned via PostgreSQL Row-Level Security (RLS) in a multi-tenant environment, and uploaded files are protected in encrypted cloud object storage (R2/S3).'}
          </p>
        </section>
      </div>
    </div>
  );
}

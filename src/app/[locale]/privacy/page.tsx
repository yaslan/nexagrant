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
              ? 'KVKK 11. maddesi ve GDPR uyarınca verilerinizi dilediğiniz an sistemden JSON formatında dışa aktarabilir (/api/gdpr/export) veya hesabınızı ve tüm yüklenmiş belgelerinizi kalıcı olarak silebilirsiniz (/api/gdpr/delete).'
              : 'Under GDPR and relevant data protection legislation, you may export your complete data profile at any time in JSON format (/api/gdpr/export) or request immediate, permanent deletion of your account and files (/api/gdpr/delete).'}
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

export default async function DpaPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isTr = locale === 'tr';

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 bg-surface border rounded-xl my-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {isTr ? 'Veri İşleme Sözleşmesi (DPA Şablonu)' : 'Data Processing Agreement (DPA)'}
      </h1>
      
      <div className="prose prose-slate max-w-none text-ink-2 space-y-6">
        <p className="text-sm text-muted">
          {isTr 
            ? 'Bu sözleşme, FonBridge platformunu kullanan tüzel kişilikler (Veri Sorumlusu) ile FonBridge (Veri İşleyen) arasındaki karşılıklı veri koruma taahhütlerini belirler.'
            : 'This agreement establishes the data protection terms between customer entities (Data Controller) and FonBridge (Data Processor).'}
        </p>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? 'Madde 1: İşlemenin Konusu ve Süresi' : 'Article 1: Scope & Duration'}
          </h2>
          <p>
            {isTr
              ? 'Veri İşleyen, Veri Sorumlusu’nun platform üzerinden yüklediği kanıt belgelerini, ortaklık ilişkilerini ve proje notlarını yalnızca SaaS hizmetlerinin ifası amacıyla işler.'
              : 'The Data Processor processes uploaded evidence files, partnership networks, and project proposals solely to provide the SaaS features requested by the Customer.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? 'Madde 2: Teknik ve İdari Tedbirler' : 'Article 2: Technical & Organizational Measures'}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{isTr ? 'Veritabanı düzeyinde kiracı yalıtımı (PostgreSQL RLS)' : 'Multi-tenant database isolation using PostgreSQL Row-Level Security (RLS)'}</li>
            <li>{isTr ? 'TLS 1.3 aktarım güvenliği ve AES-256 durağan veri şifrelemesi' : 'TLS 1.3 transit encryption and AES-256 data-at-rest encryption'}</li>
            <li>{isTr ? 'Rol tabanlı erişim kontrolü (RBAC) ve denetim kayıtları (Audit Logging)' : 'Role-based access control (RBAC) and comprehensive audit logging'}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-2">
            {isTr ? 'Madde 3: Alt Veri İşleyenler' : 'Article 3: Sub-processors'}
          </h2>
          <p>
            {isTr
              ? 'Yapay zeka çıkarımları için Anthropic ve OpenAI, ödeme altyapısı için Stripe, e-posta bildirimleri için Resend altyapısı yetkili alt işlemciler olarak kullanılmaktadır.'
              : 'Anthropic & OpenAI (AI inference), Stripe (billing/payments), and Resend (email communications) are authorized sub-processors.'}
          </p>
        </section>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Gizlilik Bildirimi — Fabrika',
  description: 'GDPR ve KVKK uyumlu gizlilik bildirimi.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
        Gizlilik Bildirimi
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <h2>1. Veri Sorumlusu</h2>
        <p>
          Fabrika A.Ş. (bundan sonra "Şirket") bu gizlilik bildirimine göre kişisel verilerinize sahibi ve
          sorumludur.
        </p>

        <h2>2. Toplanan Veriler</h2>
        <p>Aşağıdaki kişisel verileri toplarız:</p>
        <ul>
          <li>Ad, soyad, e-posta adresi</li>
          <li>Şirket adı ve ülkesi</li>
          <li>Hesap aktivitesi ve kullanım günlükleri</li>
          <li>İP adresi ve tarayıcı bilgisi</li>
        </ul>

        <h2>3. Veri İşleme Amacı</h2>
        <ul>
          <li>Hizmet sunmak ve geliştirmek</li>
          <li>Teknik destek sağlamak</li>
          <li>Yasal yükümlülükleri yerine getirmek</li>
          <li>Güvenlik ve dolandırıcılık tespiti</li>
        </ul>

        <h2>4. Yasal Temel</h2>
        <p>
          Veri işleme, GDPR Madde 6 (işletme meşru çıkarları) ve KVKK uyarınca yapılır. Açık rızanız
          gerektiğinde, tarafınızdan sağlanacaktır.
        </p>

        <h2>5. Verilerinizin Hakları</h2>
        <p>Aşağıdaki haklara sahipsiniz:</p>
        <ul>
          <li>Verilerinize erişme hakkı</li>
          <li>Verilerinizi düzeltme hakkı</li>
          <li>Verilerinizi silme hakkı ("unutulma hakkı")</li>
          <li>Veri işlemeyi sınırlandırma hakkı</li>
          <li>Veri taşınabilirliği hakkı</li>
        </ul>

        <h2>6. Veri Saklama</h2>
        <p>
          Verileriniz, hizmetin sağlanması için gerekli olduğu sürece veya yasal yükümlülüklerin
          gerektirdiği süre boyunca saklanır. Silme talebinde bulunduğunuz zaman, verileriniz 30 gün
          içerisinde kalıcı olarak silinir.
        </p>

        <h2>7. İletişim</h2>
        <p>
          Gizlilik ile ilgili sorularınız için:{' '}
          <a href="mailto:privacy@fabrika.app" className="text-indigo-600 dark:text-indigo-400">
            privacy@fabrika.app
          </a>
        </p>
      </div>
    </div>
  );
}

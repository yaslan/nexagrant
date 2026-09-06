export const metadata = {
  title: 'Hizmet Şartları — Fabrika',
  description: 'Fabrika hizmet kullanım şartları.',
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
        Hizmet Şartları
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <h2>1. Kabul</h2>
        <p>
          Fabrika hizmetini kullanarak, bu şartları kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız,
          hizmeti kullanmayınız.
        </p>

        <h2>2. Hizmet Tanımı</h2>
        <p>
          Fabrika, Avrupa fonları yönetim ve başvuru optimizasyonu hizmeti sağlar. Hizmetin kullanılabilirliği
          ve doğruluğu "olduğu gibi" garantili değildir.
        </p>

        <h2>3. Kullanıcı Sorumlulukları</h2>
        <ul>
          <li>Hesap güvenliğini sağlamalısınız</li>
          <li>Yasadışı faaliyetler için hizmet kullanmayacaksınız</li>
          <li>Diğer kullanıcıların haklarını ihlal etmeyeceksiniz</li>
        </ul>

        <h2>4. Fikri Mülkiyet</h2>
        <p>
          Fabrika platformu, içeriği ve yazılımı Fabrika A.Ş.'ye aittir. Ticari amaçlarla kopyalama
          ve yeniden dağıtım yasaktır.
        </p>

        <h2>5. Sorumluluk Sınırlaması</h2>
        <p>
          Fabrika, hizmetin kullanımından kaynaklanan doğrudan veya dolaylı zararlardan sorumlu
          değildir. Hizmet "olduğu gibi" sunulur.
        </p>

        <h2>6. Hizmetin Sonlandırılması</h2>
        <p>
          Fabrika, şartların ihlalı halinde hesabı kapatma hakkını saklı tutar. Verileriniz 30 gün
          sonra silinir.
        </p>

        <h2>7. Değişiklikler</h2>
        <p>
          Bu şartlar yazılı bildirimle değiştirilebilir. Değişiklikler yayımlandığında yürürlüğe girer.
        </p>

        <h2>8. İletişim</h2>
        <p>
          Sorularınız için:{' '}
          <a href="mailto:legal@fabrika.app" className="text-indigo-600 dark:text-indigo-400">
            legal@fabrika.app
          </a>
        </p>
      </div>
    </div>
  );
}

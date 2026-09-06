export const metadata = {
  title: 'Veri İşleme Anlaşması — Fabrika',
  description: 'GDPR uyumlu Veri İşleme Anlaşması şablonu.',
};

export default function DPAPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
        Veri İşleme Anlaşması (DPA)
      </h1>

      <div className="prose dark:prose-invert max-w-none text-sm">
        <h2>1. Taraflar</h2>
        <p>
          <strong>Veri Sorumlusu:</strong> Müşteri kuruluş <br />
          <strong>Veri İşleyen:</strong> Fabrika A.Ş.
        </p>

        <h2>2. İşlem Konusu ve Süresi</h2>
        <p>
          Fabrika, müşteri verilerini Avrupa fırsatları yönetimi hizmetini sağlamak amacıyla işler.
          Hizmet sözleşmesi süresince ve sonrasında 30 gün daha.
        </p>

        <h2>3. İşlenen Veri Kategorileri</h2>
        <ul>
          <li>Kişi bilgileri (ad, e-posta, rol)</li>
          <li>Kuruluş bilgileri (ülke, sektör, type)</li>
          <li>Hesap aktivitesi ve kullanım günlükleri</li>
          <li>Başvuru ve fırsatlar hakkında veriler</li>
        </ul>

        <h2>4. Veri Özne Kategorileri</h2>
        <ul>
          <li>Kuruluşunuzun çalışanları ve danışmanları</li>
          <li>Ortner kuruluşlarının temsilcileri</li>
        </ul>

        <h2>5. Veri İşleyen Yükümlülükleri</h2>
        <p>Fabrika aşağıdakileri taahhüt eder:</p>
        <ul>
          <li>Verileri yalnızca Sorumlusu talimatı üzerine işlemek</li>
          <li>Veri gizliliğini sağlamak</li>
          <li>Uygun güvenlik tedbirleri almak (şifreleme, erişim kontrolü)</li>
          <li>Alt işleyicileri yazılı sözleşmeyle yetkilendirmek</li>
          <li>Talep üzerine denetim ve hesaplar vermek</li>
          <li>Sözleşme sonunda verileri silmek veya iade etmek</li>
        </ul>

        <h2>6. Güvenlik Tedbirleri</h2>
        <ul>
          <li>SSL/TLS şifreleme (transit)</li>
          <li>AES-256 şifreleme (depolama)</li>
          <li>Rol tabanlı erişim kontrolü (RBAC)</li>
          <li>Düzenli penetrasyon testleri</li>
          <li>Yedekleme ve geri yükleme planları</li>
        </ul>

        <h2>7. Veri Özne Hakları</h2>
        <p>
          Fabrika, Sorumlusu aracılığıyla, veri özne isteklerini (erişim, düzeltme, silme) 30 gün
          içerisinde karşılamak için işbirliği yapacaktır.
        </p>

        <h2>8. Veri Taşıması (Transfers)</h2>
        <p>
          Veriler AB/EEA dışında saklanmaz. Gerekirse Standard Contractual Clauses (SCC) uygulanır.
        </p>

        <h2>9. İlgili Tarih</h2>
        <p>Bu DPA, Hizmet Sözleşmesi imzalanmasından itibaren yürürlüktedir.</p>

        <h2>10. Değişiklikler</h2>
        <p>
          Değişiklikler yazılı olarak 30 gün önceden bildirilir. Değişiklikleri kabul etmiyorsanız,
          sözleşmeyi iptal edebilirsiniz.
        </p>
      </div>

      <div className="mt-12 p-6 bg-blue-50 dark:bg-slate-800 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-gray-400">
          <strong>Not:</strong> Bu şablon, yasal tavsiye için avukatınızla gözden geçirilmelidir.
          Fabrika, özel sözleşmeler ve Başlangıç Değerlendirmesi (Business Associate Agreements) sunabilir.
        </p>
      </div>
    </div>
  );
}

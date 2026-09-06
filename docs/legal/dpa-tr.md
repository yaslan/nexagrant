# Veri İşleme Sözleşmesi (DPA)

Sürüm 1.0 — Yürürlük tarihi: 2026-09-06

## 1. Taraflar ve Roller

Bu sözleşme, Fabrika SaaS platformunu kullanan kurumsal müşteri ("Veri Sorumlusu") ile platformu işleten Fabrika ("Veri İşleyen") arasındadır.

Veri Sorumlusu, platforma yüklediği kişisel verilerin işlenme amaç ve vasıtalarını belirler. Veri İşleyen, bu verileri yalnızca Veri Sorumlusu'nun talimatları doğrultusunda işler.

## 2. İşlemenin Konusu ve Süresi

İşleme, Veri Sorumlusu'nun aktif aboneliği süresince devam eder. Abonelik sona erdiğinde 6. bölümdeki iade ve imha hükümleri uygulanır.

## 3. İşlenen Veri Kategorileri

| Kategori | Örnek alanlar | Hukuki dayanak |
|---|---|---|
| Kimlik ve iletişim | ad, e-posta, dil tercihi | Sözleşmenin ifası (KVKK md.5/2-c) |
| Kurumsal profil | kurum adı, ülke, PIC, yetenek metni | Sözleşmenin ifası |
| Kullanım kayıtları | oturum zamanları, modül erişimleri, denetim olayları | Meşru menfaat (KVKK md.5/2-f) |
| Proje ve teklif verisi | fırsat, teklif, konsorsiyum koltuğu, kişi-gün | Sözleşmenin ifası |
| Faturalama | plan, abonelik durumu, ödeme sağlayıcı kimlikleri | Hukuki yükümlülük (KVKK md.5/2-ç) |
| Yapay zeka kullanım günlüğü | model, jeton sayısı, kredi, istem özeti (hash) | Meşru menfaat, şeffaflık |

Kimlik doğrulama sırları (OAuth ve oturum jetonları) veri sahibi dışa aktarımlarına dahil edilmez.

## 4. Veri Sahibi Hakları

Veri Sorumlusu'nun kullanıcıları platform üzerinden şu hakları doğrudan kullanabilir:

- **Erişim ve taşınabilirlik:** `Ayarlar → Gizlilik ve Verilerim → Verilerimi İndir` (JSON)
- **Silme:** `Ayarlar → Gizlilik ve Verilerim → Hesabı Sil İsteği` — hesap derhal erişime kapatılır, 30 gün sonra kalıcı olarak silinir
- **Silme talebinden dönme:** 30 günlük süre içinde aynı ekrandan iptal

Düzeltme ve itiraz talepleri Veri Sorumlusu'nun kiracı yöneticisi üzerinden karşılanır.

## 5. Güvenlik Önlemleri

- Kiracı verileri PostgreSQL Row Level Security ile satır düzeyinde yalıtılır.
- Dosya ekleri şifreli nesne depolamada (S3 uyumlu) saklanır.
- Erişim rol tabanlıdır; hassas işlemler çift onay gerektirir.
- Denetim olayları `AuditEvent` tablosunda tutulur.
- Yapay zeka çağrılarında müşteri verisi model eğitimi için kullanılmaz.

## 6. Verilerin İadesi ve İmhası

Abonelik sona erdiğinde Veri Sorumlusu 30 gün içinde tüm veriyi dışa aktarabilir. Bu sürenin sonunda veriler kalıcı olarak silinir. Faturalama ve denetim kayıtları, yasal saklama süreleri boyunca kimliksizleştirilmiş biçimde tutulur.

## 7. Alt İşleyenler

Veri İşleyen, aşağıdaki kategorilerde alt işleyen kullanır: barındırma ve veritabanı, nesne depolama, e-posta gönderimi, ödeme altyapısı, yapay zeka model sağlayıcıları, hata izleme. Alt işleyen değişiklikleri Veri Sorumlusu'na önceden bildirilir.

## 8. İhlal Bildirimi

Kişisel veri ihlali tespit edildiğinde Veri İşleyen, Veri Sorumlusu'na gecikmeksizin ve en geç 72 saat içinde bildirimde bulunur; ihlalin kapsamı, etkilenen veri kategorileri ve alınan önlemler bildirimde yer alır.

## 9. Denetim

Veri Sorumlusu, yılda bir kez, makul bildirim süresiyle, işleme faaliyetlerine ilişkin belge ve raporları talep edebilir.

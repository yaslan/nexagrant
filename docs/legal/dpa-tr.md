# Veri İşleme Sözleşmesi (DPA)

**Sürüm:** 1.2 · **Metin tarihi:** 2026-10-01 · **Yürürlük tarihi:** 12. maddedeki son imza tarihi

## Sürüm Geçmişi

| Sürüm | Tarih      | Değişiklik                                                                                                                                         |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0   | 2026-09-06 | İlk yayım (şablon, imza alanı yok)                                                                                                                 |
| 1.0   | 2026-09-08 | 7. madde değişti, sürüm numarası ve tarih güncellenmedi                                                                                            |
| 1.1   | 2026-10-01 | Taraflar, iletişim, imza ve yürürlük maddeleri eklendi; 6. madde kodla uyumlu hale getirildi; alt işleyenler Ek-1'de adıyla listelendi |
| 1.2   | 2026-10-01 | 13. madde (dil önceliği, uygulanacak hukuk, yetki) eklendi; 4, 5, 7, 8, 9. maddelere GDPR md.28(3) ve KVKK md.12 unsurları ile yurt dışı aktarım dayanağı eklendi; 5. maddede model eğitimi ifadesinin dayanağı açıklandı |

## 1. Taraflar ve Roller

Bu sözleşme, aşağıdaki tabloda bilgileri yazılı iki taraf arasında yapılmıştır.

| Bilgi                      | Veri Sorumlusu (müşteri kurum) | Veri İşleyen                    |
| -------------------------- | ------------------------------ | ------------------------------- |
| Ad                         | ............................... | FonBridge                       |
| Ticari unvan               | ............................... | ............................... |
| Adres                      | ............................... | ............................... |
| Vergi dairesi / VKN        | ............................... | ............................... |
| MERSİS no                  | ............................... | ............................... |
| Bildirim e-posta adresi    | ............................... | info@fonbridge.com              |

Veri İşleyen FonBridge'dir. Veri Sorumlusu, FonBridge tarafından işletilen FonBridge platformunu ("Platform") kullanan kurumdur. Veri Sorumlusu, Platform'a yüklediği kişisel verilerin işlenme amaç ve vasıtalarını belirler. Veri İşleyen, bu verileri yalnızca Veri Sorumlusu'nun talimatları doğrultusunda işler.

## 2. İşlemenin Konusu ve Süresi

İşleme, Veri Sorumlusu'nun aktif aboneliği süresince devam eder. Abonelik sona erdiğinde 6. maddedeki iade ve imha hükümleri uygulanır.

## 3. İşlenen Veri Kategorileri

| Kategori                    | Örnek alanlar                                        | Hukuki dayanak                    |
| --------------------------- | ---------------------------------------------------- | --------------------------------- |
| Kimlik ve iletişim          | ad, e-posta, dil tercihi                             | Sözleşmenin ifası (KVKK md.5/2-c) |
| Kurumsal profil             | kurum adı, ülke, PIC, yetenek metni                  | Sözleşmenin ifası                 |
| Kullanım kayıtları          | oturum zamanları, modül erişimleri, denetim olayları | Meşru menfaat (KVKK md.5/2-f)     |
| Proje ve teklif verisi      | fırsat, teklif, konsorsiyum koltuğu, kişi-gün        | Sözleşmenin ifası                 |
| Faturalama                  | plan, abonelik durumu, ödeme sağlayıcı kimlikleri    | Hukuki yükümlülük (KVKK md.5/2-ç) |
| Yapay zeka kullanım günlüğü | model, jeton sayısı, kredi, istem özeti (hash)       | Meşru menfaat, şeffaflık          |

Kimlik doğrulama sırları (OAuth ve oturum jetonları) veri sahibi dışa aktarımlarına dahil edilmez.

## 4. Veri Sahibi Hakları

Veri Sorumlusu'nun kullanıcıları Platform üzerinden şu hakları doğrudan kullanabilir:

- **Erişim ve taşınabilirlik:** `Ayarlar → Gizlilik ve Verilerim → Verilerimi İndir` (JSON)
- **Silme:** `Ayarlar → Gizlilik ve Verilerim → Hesabı Sil İsteği` — hesap derhal erişime kapatılır, 30 gün sonra kalıcı olarak silinir
- **Silme talebinden dönme:** 30 günlük süre içinde aynı ekrandan iptal

Düzeltme ve itiraz talepleri Veri Sorumlusu'nun kiracı yöneticisi üzerinden karşılanır.

**Veri sahibi taleplerinde yardım:** Veri İşleyen, işlemenin niteliğini dikkate alarak, Veri Sorumlusu'nun veri sahibi taleplerini (GDPR md.12-22; KVKK md.11 ve 13) yanıtlama yükümlülüğünü yerine getirebilmesi için uygun teknik ve idari tedbirlerle Veri Sorumlusu'na yardım eder. Veri İşleyen'e doğrudan ulaşan bir veri sahibi talebi, Veri Sorumlusu'nun talimatı olmadıkça yanıtlanmaz; gecikmeksizin 10. maddedeki adrese iletilir.

## 5. Güvenlik Önlemleri

- Kiracı verileri PostgreSQL Row Level Security ile satır düzeyinde yalıtılır.
- Dosya ekleri şifreli nesne depolamada (S3 uyumlu) saklanır.
- Erişim rol tabanlıdır; hassas işlemler çift onay gerektirir.
- Denetim olayları `AuditEvent` tablosunda tutulur.
- Veri İşleyen, kişisel verileri işleyen kendi personelinin gizlilik yükümlülüğü altında olmasını sağlar; bu yükümlülük görev sona erdikten sonra da sürer (GDPR md.28(3)(b); KVKK md.12/1 ve 12/4).
- Veri İşleyen, işlemenin niteliğine uygun bir güvenlik düzeyini sağlayacak teknik ve idari tedbirleri alır (GDPR md.32; KVKK md.12/1).
- Yapay zeka çağrılarında müşteri verisinin model eğitimi için kullanılmaması, Veri İşleyen'in yapay zeka sağlayıcılarıyla (Ek-1: Anthropic, OpenAI) imzalanmış ayrı bir sözleşmeye değil, bu sağlayıcıların yayımlanmış ticari hizmet şartlarına dayanır (bu şartlar API üzerinden gönderilen içeriğin sağlayıcının modellerini eğitmek için kullanılmayacağını öngörür; sağlayıcılar şartlarını değiştirebilir). Sağlayıcılar, kendi şartlarına göre gönderilen içeriği sınırlı bir süre saklayabilir; örneğin OpenAI metin gömme isteklerinde bugün bu süre 30 güne kadardır. Saklama süresinin sıfır olduğu taahhüt edilmez.

## 6. Verilerin İadesi ve İmhası

- **6.1 Sona ermede dışa aktarım:** Abonelik sona erdiğinde Veri Sorumlusu, sona erme tarihinden itibaren 30 gün içinde verilerinin dışa aktarılmasını isteyebilir. Kurum düzeyindeki toplu dışa aktarım bugün Platform'da kendi kendine kullanılabilen bir işlev değildir; talep 10. maddedeki adrese yazılı olarak iletilir ve Veri İşleyen tarafından yerine getirilir. Kullanıcı düzeyindeki dışa aktarım 4. maddedeki ekrandan yapılır.
- **6.2 Sona ermede imha:** Sözleşme sona erdiğinde Veri Sorumlusu'nun tercihine göre veriler iade edilir ya da silinir (GDPR md.28(3)(g)). 30 günlük sürenin sonunda Veri İşleyen, 6.4'te sayılan kayıtlar dışındaki verileri kalıcı olarak siler. Kurum düzeyindeki imha bugün Platform'da otomatik çalışan bir işlem değildir; Veri İşleyen tarafından yapılır ve tamamlandığı 10. maddedeki adrese yazılı olarak bildirilir.
- **6.3 Kullanıcı hesabının silinmesi:** 4. maddeye göre bir hesap silindiğinde, Veri Sorumlusu'na ait olup saklanması gereken kayıtlar (denetim olayları, yapay zeka kullanım günlüğü, fırsat, geri bildirim, teklif kullanımı ve ilişki kayıtları) silinmez; bu kayıtlardaki kullanıcı kimliği bağlantısı kaldırılır. Denetim olaylarının serbest içerik alanı bu işlemde değiştirilmez ve kişisel veri içerebilir. Silme işleminin kendisi, kullanıcı kimliğinin tek yönlü özeti (hash) ile kayda geçirilir.
- **6.4 Kimliksizleştirilmeden saklanan kayıtlar:** Aşağıdaki kayıtlar kimliksizleştirilmez ve gerekçeleri süresince saklanır: (a) düzenlenmiş faturalar — alıcının unvanı, VKN veya TCKN'si, vergi dairesi ve adresi, faturanın düzenlendiği andaki haliyle, ilgili vergi mevzuatının öngördüğü saklama süresi boyunca; (b) çift onay adımlarında onaylayan kişinin kimliği ve adı, onayın imza niteliği taşıması nedeniyle; (c) kullanıcıya aydınlatma yapıldığını ve onay alındığını gösteren kayıtlar, ispat yükümlülüğü nedeniyle.

## 7. Alt İşleyenler

Veri İşleyen, Ek-1'de adı, hizmeti, konumu ve işlediği veri yazılı alt işleyenleri kullanır. Veri Sorumlusu bu alt işleyenlerin kullanımına genel olarak izin verir.

- **7.1 Önceden bildirim ve itiraz:** Alt işleyen eklenmesi veya değiştirilmesi, değişiklik devreye alınmadan önce en az 30 gün önceden 10. maddedeki adres üzerinden Veri Sorumlusu'na bildirilir. Veri Sorumlusu bu sürede, makul ve veri korumasına ilişkin gerekçeyle yazılı olarak itiraz edebilir. İtiraz halinde taraflar çözümü iyi niyetle görüşür; çözüm bulunamazsa Veri Sorumlusu, itiraz konusu alt işleyenle ilgili hizmeti sona erdirebilir ve 6. maddedeki iade ve imha hükümleri uygulanır.
- **7.2 Aynı yükümlülüklerin yüklenmesi:** Veri İşleyen, her alt işleyene bu sözleşmedeki veri koruma yükümlülüklerini yazılı sözleşmeyle yükler (GDPR md.28(4); KVKK md.12). Alt işleyenin yükümlülüklerini yerine getirmemesi halinde Veri İşleyen, Veri Sorumlusu'na karşı sorumludur.
- **7.3 Yurt dışına aktarım:** Ek-1'de ABD'de konumlanan alt işleyenlere (Anthropic, OpenAI, Stripe, Google) kişisel veri aktarımı yapılabilir. Aktarım dayanağı, Avrupa Birliği'nden gelen veriler için GDPR md.45 kapsamında Avrupa Komisyonu'nun yeterlilik kararına dayanan AB-ABD Veri Gizliliği Çerçevesi (DPF) sertifikası ya da bu yoksa GDPR md.46 kapsamında Standart Sözleşme Hükümleri (SCC); Türkiye'den gelen veriler için KVKK md.9 kapsamında yeterlilik kararı ya da uygun güvenceler, yani standart sözleşmenin imzalanması ve imzadan sonraki yasal süre içinde Kişisel Verileri Koruma Kurumu'na bildirilmesidir. Veri İşleyen, aktarımın dayanağını Veri Sorumlusu'nun talebi üzerine yazılı olarak bildirir.

Hata izleme bugün hiçbir üçüncü tarafa alt işlettirilmiyor; hatalar yalnız Platform'un kendi `SystemAlert` mekanizmasında tutulur. Ürün analitiği için Ek-1'de yer alan sağlayıcı Platform'a entegre edilmiştir ancak devre dışıdır; devreye alınmadan önce bu maddedeki bildirim yapılır.

## 8. İhlal Bildirimi

Kişisel veri ihlali tespit edildiğinde Veri İşleyen, Veri Sorumlusu'na gecikmeksizin ve en geç 72 saat içinde bildirimde bulunur; ihlalin kapsamı, etkilenen veri kategorileri ve alınan önlemler bildirimde yer alır. Veri İşleyen ayrıca, işlemenin niteliğini ve elindeki bilgiyi dikkate alarak, Veri Sorumlusu'na güvenlik yükümlülüklerinde (GDPR md.32), ihlalin denetim makamına ve ilgili kişilere bildiriminde (GDPR md.33-34; KVKK md.12/5), veri koruma etki değerlendirmesinde (GDPR md.35) ve denetim makamına önceden danışmada (GDPR md.36) yardım eder.

## 9. Denetim

Veri İşleyen, bu sözleşmedeki yükümlülüklere uyduğunu göstermek için gerekli tüm bilgiyi Veri Sorumlusu'nun kullanımına sunar. Veri Sorumlusu, yılda bir kez, makul bildirim süresiyle, işleme faaliyetlerine ilişkin belge ve raporları talep edebilir; ayrıca kendisi ya da görevlendirdiği bir denetçi aracılığıyla, makul bildirimle ve Veri İşleyen'in faaliyetlerini gereksiz yere aksatmayacak biçimde denetim yapabilir. Veri Sorumlusu, ihlal şüphesi veya yetkili makamın talebi halinde bu denetimi yılda bir kezle sınırlı olmaksızın yapabilir (GDPR md.28(3)(h); KVKK md.12/3).

## 10. İletişim ve Bildirimler

Bu sözleşme kapsamındaki bildirimler (ihlal bildirimi, alt işleyen değişikliği, dışa aktarım ve imha talepleri, veri sahibi başvurularının iletilmesi) yazılı olarak, 1. maddedeki tabloda yazılı bildirim e-posta adreslerine yapılır. Veri İşleyen'in bildirim adresi **info@fonbridge.com**'dur. Taraflar adres değişikliğini birbirine yazılı olarak bildirir.

## 11. Sürüm ve Değişiklik

Bu sözleşmenin geçerli metni, üzerinde yazılı sürüm numarası ve metin tarihiyle tanımlanır. Metinde yapılan her değişiklik yeni bir sürüm numarası ve tarih alır ve Sürüm Geçmişi tablosuna işlenir.

## 12. Yürürlük ve İmza

Bu sözleşme, tarafların aşağıda imzaladığı tarihlerden sonuncusunda yürürlüğe girer ve 2. maddedeki süre boyunca geçerlidir.

| Alan             | Veri Sorumlusu adına            | Veri İşleyen adına              |
| ---------------- | ------------------------------- | ------------------------------- |
| Ad Soyad         | ............................... | ............................... |
| Unvan / Görevi   | ............................... | ............................... |
| Tarih            | ....../....../..........        | ....../....../..........        |
| İmza             |                                 |                                 |

## 13. Dil Önceliği, Uygulanacak Hukuk ve Yetki

- **13.1 Dil:** Bu sözleşme Türkçe ve İngilizce hazırlanmıştır. İki metin arasında çelişki veya yorum farkı olması halinde Türkçe metin geçerlidir.
- **13.2 Uygulanacak hukuk:** Bu sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır.
- **13.3 Yetkili mahkeme:** Bu sözleşmeden doğan uyuşmazlıklarda İstanbul (Merkez) Mahkemeleri ve İcra Daireleri yetkilidir.

## Ek-1: Alt İşleyenler

| Alt işleyen                    | Hizmet                                                                        | Konum                                 | İşlenen veri                                                         | Durum                                       |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Vulut                          | Barındırma: uygulama sunucusu, PostgreSQL veritabanı, iş kuyruğu, e-posta sunucusu | Türkiye                               | Platform'daki tüm veri; giden e-postaların içeriği ve alıcı adresi   | Kullanımda                                  |
| Cloudflare, Inc. (R2) | Nesne depolama | Belirtilecek: ................ | Dosya ekleri, kanıt dosyaları, kurum logoları | Kullanımda |
| Anthropic PBC                  | Yapay zeka dil modeli                                                         | ABD                                   | Yapay zeka özelliklerinde gönderilen istem metni                     | Kullanımda                                  |
| OpenAI, L.L.C.                 | Yapay zeka dil modeli ve metin gömme (embedding)                              | ABD                                   | İstem metni; arama için gömülen belge metni                          | Kullanımda                                  |
| Stripe, Inc.                   | Ödeme altyapısı                                                               | ABD                                   | Ödeme sayfasında girilen ödeme bilgileri; kurum ve abonelik kimlikleri | Kullanımda                                  |
| iyzico | Ödeme altyapısı (TL) | Türkiye | Alıcının adı, soyadı, e-posta adresi, kimlik numarası, adresi, IP adresi; ödeme bilgileri | Entegre; bugün bu yolla ödeme alınmıyor; devreye alınmadan önce 7. maddedeki bildirim yapılır |
| Google LLC | Google hesabıyla oturum açma; Google Takvim eşitleme | ABD | Oturum açmada ad, e-posta adresi, Google hesap kimliği; takvim eşitlemede toplantı başlığı (ortak kurumun adı) ve toplantı notunun ilk 500 karakteri | Kullanıcı bu giriş yolunu ya da takvim bağlantısını seçerse |
| PostHog Inc.                   | Ürün analitiği                                                                | AB                                    | Onay sonrası tarayıcıya özgü rastgele kimlik ve ürün kullanım olayları (kullanıcı kimliği, e-posta ve ad gönderilmez; isteğin IP adresi sağlayıcıya ulaşır) | Entegre, devre dışı (7. madde)              |

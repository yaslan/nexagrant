# Fabrika Beta Programı — Tasarım Ortağı Rehberi

> Sürüm: 1.0 · Tarih: 2026-09-06 · Dil: Türkçe (İngilizcesi: [`BETA_GUIDE.en.md`](./BETA_GUIDE.en.md))
> Kapsam: E11 · Beta (10 tasarım ortağı, 8 hafta) — bkz. [`ROADMAP.md`](./ROADMAP.md) § E11

---

## 0. Bir bakışta

| Başlık | Değer |
|---|---|
| Program | Fabrika Beta — Tasarım Ortağı Programı |
| Süre | 8 hafta · **2026-09-07 → 2026-11-01** |
| Ortak sayısı | 10 tasarım ortağı (KOBİ, üniversite TTO, danışmanlık, araştırma merkezi) |
| Ücret | Beta boyunca ücretsiz (Ekip planı yetkileri + 500 YZ kredisi) |
| Haftalık ritim | Perşembe 14:00–14:45 (Europe/Istanbul) ortak sync |
| Beklenen katkı | Haftada ~1 saat: 1 sync + en az 1 gerçek çağrı üzerinde kullanım |
| Çıktı | Ürün geri bildirimi, hata triyajı, fiyat doğrulama, G0 kalibrasyonu |

---

## 1. Program nedir?

Fabrika, Avrupa fonları (Ufuk Avrupa, Digital Europe, Eurostars) için **çok kiracılı proje pipeline
platformudur**: çağrı istihbaratı, kapı (stage-gate) modeli, konsorsiyum eşleştirme, kanıt yönetimi ve
teklif üretim iş akışları tek yerde toplanır.

Beta programının amacı **özellik göstermek değil, gerçek bir başvuru döngüsünü uçtan uca test etmektir.**
Tasarım ortağı olarak siz gerçek bir çağrı üzerinde çalışırsınız; biz de her hafta bu kullanımdan çıkan
sürtünmeyi ürüne yansıtırız.

### Kimler için

| Profil | Tipik kullanım | Beta'da odak |
|---|---|---|
| KOBİ Ar-Ge ekibi | 1–3 eş zamanlı teklif | G0 fikir taraması, M2 konsept notu |
| Üniversite TTO | 5–15 akademisyen, çok sayıda fikir | M4 Focal Point, kapı disiplini |
| Danışmanlık | Çok kiracılı portföy | Pipeline görünürlüğü, kişi-gün ölçümü |
| Araştırma merkezi | Konsorsiyum liderliği | M1/M8 ortak istihbaratı |

### Neden 10 ortak

Her profil için en az iki ortak; böylece bir geri bildirim "tek kullanıcının tercihi mi, yoksa profilin
gerçek ihtiyacı mı" ayırt edilebilir. Kalibrasyon (E11.3) için de en az 10 gerçek G0 skoru gerekir.

---

## 2. Beta kapsamı

### Kullanıma açık modüller (MVP)

| Modül | Ad | Beta'da ne yapar |
|---|---|---|
| M1 | Partner Intelligence Database | CORDIS ortak profilleri, geçmiş projeler |
| M2 | Concept Note Architectures | Konsept notu taslağı (YZ destekli, kredi harcar) |
| M3 | Evidence Pack | Kanıt/kaynak deposu; her istatistiğin dayanağı |
| M4 | Focal Point | Kurum içi fikir toplama ve ön eleme |
| M5 | Proposal Production Workflows | Kapı akışı, görev dağılımı, KPI paneli |
| M8 | Consortium Matching | Ortak arama ve rol dağılımı |
| — | Yönetici konsolu | Kullanıcı, rol ve modül durumu yönetimi |

v1.1 ve sonrasına bırakılan modüller (M6 Evaluator Lens, M9 Meeting Briefs, M10, M11, M7) beta kapsamında
**değildir**; yol haritasında yerleri [`ROADMAP.md`](./ROADMAP.md) dosyasındadır.

### Kapı modeli (G0 → G4)

| Kapı | Ad | Kapıdan geçme koşulu |
|---|---|---|
| G0 | Fikir & Konsept | Fikir tarama ve stratejik uyum |
| G1 | Çağrı Eşleşmesi | Ufuk Avrupa uyum skoru eşiğin üstünde |
| G2 | Konsorsiyum | Ortaklar ve rol dağılımı netleşti |
| G3 | Taslak & İnceleme | İç inceleme tamamlandı |
| G4 | Resmî Başvuru | AB portalına yükleme hazır |

### Beta'da **olmayan** şeyler (baştan net olsun)

- **F&T Portal'a otomatik gönderim yok.** Resmî başvuru her zaman sizin elinizle, portalda yapılır.
- **Değerlendirme çıktısı resmî puan değildir.** Tüm skorlar "iç ön değerlendirme" etiketiyle sunulur.
- **Ödeme akışı beta'da kapalıdır.** Fiyatlandırma yalnızca doğrulama görüşmelerinde konuşulur (E11.4).
- **SLA taahhüdü yoktur.** Destek hedefleri § 5'te "hedef" olarak verilir, sözleşme değildir.

---

## 3. Onboarding — adım adım

### Gün 0 · Hazırlık (biz yaparız)

- [ ] Kiracı (tenant) ve çalışma alanı (workspace) açılır; ülke ve kurum tipi ayarlanır.
- [ ] Ekip planı yetkileri + 500 YZ kredisi tanımlanır.
- [ ] Davet e-postası: giriş bağlantısı + bu rehber + veri işleme sözleşmesi (DPA).

### Gün 1 · İlk giriş (30 dakika, siz yaparsınız)

1. Giriş: kurumsal e-posta ile (Google / Microsoft Entra ID / e-posta) → `/tr/giris`.
2. Çerez tercihleri: gerekli / tümü (analitik açık değilse kullanım metriği toplanmaz).
3. Profil ve kurum bilgisi doğrulama → `Ayarlar`.
4. Gizlilik ayarları ve veri hakları → `Ayarlar → Gizlilik` (veri dışa aktarma, silme talebi).
5. Ekip arkadaşlarını davet et → `Yönetici Konsolu` (rol matrisi § Ek A).

### Hafta 1 · İlk gerçek döngü (2–3 saat)

1. **Çağrı seç:** `Çağrılar` ekranından size uygun açık bir çağrı seçin (son tarih ≥ 6 hafta olsun).
2. **Fırsat aç:** Çağrıyı bir *Fırsat* olarak pipeline'a alın; sorumlusunu atayın.
3. **G0'ı geçirin:** Fikir tanımı + stratejik uyum notu; kapı kararını kaydedin.
4. **Kanıt ekleyin:** İddia ettiğiniz her rakam için M3 Kanıt Deposu'na kaynak girin.
5. **Ortak arayın:** M1/M8 ile en az 3 aday ortak profili çıkarın.
6. **Konsept notu:** M2 ile ilk taslağı üretin (1 kredi) ve **elle düzeltin** — ham çıktı kullanılmaz.

> **Hafta 1 çıkış kriteri:** en az 1 fırsat G1'e taşınmış ve panelde görünüyor olmalı.

### Hafta 2–8 · Süregelen kullanım

Her hafta en az: 1 kapı kararı, 1 geri bildirim kaydı, 1 sync katılımı.

---

## 4. Haftalık ritim ve takvim

### Sync takvimi (Perşembe 14:00–14:45, Europe/Istanbul)

| Hafta | Tarih | Tema |
|---|---|---|
| 1 | 2026-09-10 | Kurulum, ilk çağrı seçimi, engeller |
| 2 | 2026-09-17 | G0/G1 deneyimi, çağrı istihbaratı kalitesi |
| 3 | 2026-09-24 | M1/M8 ortak eşleştirme doğruluğu |
| 4 | 2026-10-01 | Konsept notu (M2) çıktı kalitesi + kredi tüketimi |
| 5 | 2026-10-08 | Kanıt disiplini (M3) ve raporlama |
| 6 | 2026-10-15 | KPI paneli: hangi metrik karar değiştiriyor? |
| 7 | 2026-10-22 | **Fiyat doğrulama atölyesi** (E11.4) |
| 8 | 2026-10-29 | G0 kalibrasyonu (E11.3) + beta kapanışı, sonraki adımlar |

Takvim dosyası: [`beta/beta-weekly-sync.ics`](./beta/beta-weekly-sync.ics) — Google Calendar, Outlook ve
Apple Takvim'e içe aktarılabilir (Google Takvim: *Ayarlar → İçe aktar ve dışa aktar → İçe aktar*).
Otomatik takvim entegrasyonu v1.1 kapsamındadır; beta'da takvim **statik ICS** ile dağıtılır.

### Sync gündem şablonu (45 dakika)

| Süre | Bölüm | İçerik |
|---|---|---|
| 5 dk | Durum | Pipeline panelinden canlı ekran: kaç fırsat, hangi kapıda |
| 15 dk | Sürtünme | Bu hafta sizi yavaşlatan 3 şey (somut ekran/adım ile) |
| 10 dk | Haftanın teması | Yukarıdaki tabloya göre derinlemesine konu |
| 10 dk | Triyaj | Açılan hata/istek kayıtlarının önceliklendirilmesi |
| 5 dk | Karar & aksiyon | Kim, ne, ne zaman — kayıt altına alınır |

Katılamadığınız hafta: **asenkron form** (aynı 5 başlık) sync'ten önce doldurulur; kayıt ve notlar
program kanalında paylaşılır.

---

## 5. Geri bildirim ve hata bildirimi

### Nasıl bildirilir

Her kayıt şunları içermeli: **ne yapmaya çalıştınız · ne oldu · ne beklediniz · ekran görüntüsü/URL.**
Detaylı triyaj sistemi E11.2 kapsamında kurulur; beta boyunca kayıtlar program kanalından toplanır.

### Öncelik ve hedef süreler (taahhüt değil, hedef)

| Öncelik | Tanım | İlk yanıt | Hedef çözüm |
|---|---|---|---|
| P0 | Veri kaybı / giriş yapılamıyor / kiracı sızıntısı şüphesi | 2 saat | Aynı gün |
| P1 | Ana akış bloke (kapı kararı, teklif üretimi) | 1 iş günü | 3 iş günü |
| P2 | Rahatsız edici ama geçici çözümü var | 2 iş günü | Sonraki sürüm |
| P3 | İyileştirme / istek | Haftalık sync'te | Yol haritasına alınır |

> **P0 şüphesi varsa beklemeyin**, doğrudan destek kanalından yazın (§ 8).

---

## 6. Başarı ölçütleri

Programın başarısı, ortakların panelinde görünen aynı metriklerle ölçülür (`Panel` → KPI kartları):

| Metrik | Beta hedefi | Nerede görünür |
|---|---|---|
| Toplam teklif (aktif fırsat) | Ortak başına ≥ 2 | KPI kartı "Toplam Teklif" |
| Eşik üstü oranı | Ölçülebilir hale gelmesi (baz çizgi) | KPI kartı "Eşik Üstü Oranı" |
| Kişi-gün / teklif | Baz çizgiye göre azalma | KPI kartı "Kişi-Gün / Teklif" |
| G0 → G2 süresi | Baz çizgiye göre kısalma | KPI kartı "Ort. G2 Onay Süresi" |
| Aktif modül sayısı | Ortak başına ≥ 4 modül | KPI kartı "Aktif Modüller" |
| Haftalık geri bildirim | Ortak başına ≥ 1 kayıt/hafta | Triyaj kayıtları |

Beta'nın ilk haftasında ölçülen değerler **baz çizgidir**; hedef, 8. haftada bu çizgiye göre iyileşmedir.
Panelde gösterilen her oran bir kayda dayanır; kaynak yoksa metrik "veri yok" olarak görünür.

---

## 7. Veri, gizlilik ve uyum

- **Kiracı izolasyonu:** Her kayıt bir kiracıya bağlıdır; veritabanı seviyesinde satır bazlı güvenlik
  (RLS) uygulanır. Bir ortağın verisi başka bir ortağa görünmez.
- **YZ kullanımı:** LLM çağrıları kayıt altına alınır (modül, amaç, model, token, kredi). **Verileriniz
  model eğitimi için kullanılmaz.**
- **Haklarınız:** Veri dışa aktarma ve silme talebi doğrudan üründen: `Ayarlar → Gizlilik`.
- **Sözleşme:** Veri İşleme Sözleşmesi (DPA) → [`legal/dpa-tr.md`](./legal/dpa-tr.md) (İngilizce:
  [`legal/dpa-en.md`](./legal/dpa-en.md)), üründe `/tr/compliance/dpa` adresinde.
- **Gizlilik:** Beta'da gördüğünüz yayımlanmamış özellikler hakkında kamuya açık paylaşım yapmadan önce
  bize danışın. Sizin proje içeriğiniz bizim için gizlidir ve referans olarak izinsiz kullanılmaz.

---

## 8. Destek ve iletişim

| Konu | Kanal | Hedef yanıt |
|---|---|---|
| Hata / engel | Program kanalı (P0 için "P0" etiketiyle) | § 5 tablosu |
| Ürün sorusu | Haftalık sync veya program kanalı | 1 iş günü |
| Hesap / yetki | Yönetici konsolu → çözülmezse program kanalı | 1 iş günü |
| Veri / hukuki | DPA'daki iletişim adresi | 5 iş günü |

---

## 9. Beta sonrası

- **7. hafta:** fiyat doğrulama atölyesi — planlar (Başlangıç €59, Ekip €249, İşletme, Kurumsal) ve
  eklentiler ortaklarla test edilir. Detay: [`BILLING.md`](./BILLING.md).
- **8. hafta:** kapanış — beta ortaklarına geçiş koşulları yazılı olarak sunulur.
- **Veri:** Beta sonunda devam etmeseniz de verileriniz silinene kadar korunur; dışa aktarma her zaman
  açıktır. Silme talebi ürün içinden yapılır.

---

## Ek A · Rol matrisi (özet)

| Rol | Kapı kararı | Teklif düzenleme | Kullanıcı yönetimi | Faturalama |
|---|---|---|---|---|
| Kiracı Sahibi (TENANT_OWNER) | ✅ | ✅ | ✅ | ✅ |
| Kiracı Yöneticisi (TENANT_ADMIN) | ✅ | ✅ | ✅ | — |
| Pipeline Yöneticisi (PIPELINE_MANAGER) | ✅ | ✅ | — | — |
| Yazar (WRITER) | — | ✅ | — | — |
| Üye (MEMBER) | — | görüntüleme | — | — |

> KPI paneli `evaluate_gates` yetkisi ister: Pipeline Yöneticisi ve üzeri görebilir.

## Ek B · Sık sorulanlar

**Gerçek bir başvurumda kullanabilir miyim?** Evet, program bunun için var. Resmî gönderimi portalda
kendiniz yaparsınız.

**Kredim biterse ne olur?** YZ özellikleri "kredi yükle" diyaloğuna düşer; diğer tüm işlevler çalışmaya
devam eder. Beta'da ek kredi talebinizi sync'te iletin.

**Ekibimden kaç kişi katılabilir?** Beta'da koltuk sınırı uygulanmaz; makul kullanım beklenir.

**İngilizce kullanabilir miyim?** Evet, arayüz TR/EN'dir; sağ üstten dil değiştirilir. Bu rehberin
İngilizcesi: [`BETA_GUIDE.en.md`](./BETA_GUIDE.en.md).

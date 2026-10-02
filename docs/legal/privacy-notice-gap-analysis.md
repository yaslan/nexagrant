# Aydınlatma Metni Eksiklik Analizi (KVKK md.10)

**Sürüm 1.0 — ölçüm tarihi 2026-09-10 · TASK-MTSWIFJKGTYC (A1+A2) · ölçen: seo-en · platform: macOS (darwin 25.6.0)**

## Bu belge nedir, ne değildir

**Nedir:** bugün yayında olan aydınlatma yüzeylerinin KVKK md.10'un beş zorunlu unsuru
karşısında **ölçülmüş** durumu; her unsur için VAR / KISMİ / YOK hükmü, hükmü destekleyen
alıntı ve komut çıktısı; ve hukuk ekibinin önüne konacak, **doldurulacak boşlukları adıyla
işaretlenmiş** bir şablon (§6).

**Ne değildir:** hukuki metin değildir. Bu belgede **tek bir aydınlatma cümlesi yazılmamıştır**
— taslak cümle de önerilmemiştir. Her boşluk `<<HUKUK: …>>` biçiminde işaretlidir ve yanında
"hukukçudan ne isteniyor" tek cümleyle yazılıdır. Metni hukuk ekibi yazar.

**Kaynaklar:** `docs/legal/processing-register.md` (18 işleme faaliyeti, §21 yurt dışı aktarım
özeti) · `messages/tr.json` / `messages/en.json` (`legal.privacy`, `settings.privacy`) ·
`src/app/[locale]/privacy/page.tsx` · `src/app/[locale]/(app)/[workspace]/settings/privacy/`.
Ölçüm komutlarının tamamı §8'dedir.

---

## 1. Bugün yayında olan yüzeyler ve ne dedikleri

Aydınlatma niteliği taşıyabilecek **iki** yüzey var. Üçüncü bir yüzey (kayıt/giriş anında
aydınlatma) **yok** — bkz. madde 1.4.

### 1.1 `/[locale]/privacy` — "Gizlilik Politikası ve KVKK Aydınlatma Metni"

Dört bölüm; metnin tamamı `messages/{tr,en}.json` → `legal.privacy` altında.

| #   | Başlık (TR)                                 | Gövde — bugün ne diyor (özet)                                                                                                 |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Veri Sorumlusu                              | Tek cümle: "{brand} SaaS Platformu olarak … azami özen göstermekteyiz." Kimlik bilgisi (unvan, adres, VKN, iletişim) **yok**. |
| 2   | İşlenen Veriler ve Toplama Amaçları         | Beş amaç ve dört veri kategorisi tek cümlede sayılıyor.                                                                       |
| 3   | Veri Sahibi Hakları (Dışa Aktarma ve Silme) | md.11'e **atıf** var; anlatılan hak **iki tane**: JSON dışa aktarma ve hesap silme (30 gün).                                  |
| 4   | Güvenlik ve Depolama                        | RLS + şifreli nesne depolama (R2/S3).                                                                                         |

### 1.2 `/[locale]/[workspace]/settings/privacy` — "Gizlilik ve Verilerim"

Bu bir **hak kullanım konsolu**dur, aydınlatma metni değildir: dışa aktar / silme talep et /
talebi iptal et + üç yasal belge bağlantısı. Girişi: _"KVKK 11. madde ve GDPR kapsamındaki
haklarınızı buradan kullanabilirsiniz."_ md.10 unsurlarından hiçbirini taşımaz, taşıması da
beklenmez — bu belgede yalnızca "hakların kullanım kanalı" olarak sayılmıştır.

### 1.3 ⛔ ENGELLEYİCİ KUSUR — 1. bölümün gövdesi kullanıcıya HİÇ GÖRÜNMÜYOR

`src/app/[locale]/privacy/page.tsx` `PRODUCT_NAME`'i import **etmiyor** ve `t('controllerBody')`
ile `t('metaTitle')`/`t('metaDescription')`'ı **interpolasyon değeri vermeden** çağırıyor; bu üç
katalog dizesi ise `{brand}` yer tutucusu taşıyor. next-intl 4.14.2 `FORMATTING_ERROR` üretip
mesaj yerine **anahtar yolunu** basıyor.

Canlı sunucudan ölçüm (`pnpm dev -p 3117`, `curl`), her iki dilde:

```
===== /tr/privacy =====
TITLE: legal.privacy.metaTitle
META-DESC: legal.privacy.metaDescription
BODY-P: legal.privacy.controllerBody
===== /en/privacy =====
TITLE: legal.privacy.metaTitle
META-DESC: legal.privacy.metaDescription
BODY-P: legal.privacy.controllerBody
```

Sayfanın görünür metninde sızan anahtar yolları: `legal.privacy.metaTitle`,
`legal.privacy.controllerBody` (2 adet; `{brand}`'in kendisi görünür metinde 0 kez geçiyor —
30 ham geçiş RSC flight yükünde, ekranda değil). Sunucu günlüğünde 18 `FORMATTING_ERROR`.

**Sonuç:** "Veri Sorumlusu" başlığının altında bugün kullanıcı `legal.privacy.controllerBody`
dizesini okuyor. Yani md.10/1-a unsuru **eksik değil, hiç yok**. `<title>` etiketi de aynı
sebeple `legal.privacy.metaTitle` basıyor. Aynı kusur `/tr/terms` (`legal.terms.metaTitle`) ve
`/tr/compliance/dpa` (`legal.dpa.metaTitle`) sayfalarında da var — üç yasal sayfanın üçü de.

**Bu kusur hukuk girdisi BEKLEMEZ.** Ürün kodu düzeltmesidir ve bu kartın kapsamı dışındadır
(kart yalnızca analiz üretir, koda dokunmaz) — §7'deki uygulama kartı taslağının 1. maddesidir.

### 1.4 Toplama anında aydınlatma yüzeyi — YOK

`src/app/[locale]/login/AuthCard.tsx` içinde `kvkk|aydınlat|onay|consent|privacy|gizlilik|terms|koşul`
desenlerinin **hiçbiri** geçmiyor (0 eşleşme). Kayıt/giriş ekranında ne aydınlatma bağlantısı ne
onay kutusu var. KVKK md.10 aydınlatmayı "kişisel verilerin elde edilmesi **sırasında**" arar;
bugün metin yalnızca ayrı bir sayfada, kullanıcının kendi bulması şartıyla duruyor.

Çerez banner'ı (`src/components/CookieConsent.tsx`) var ve `/[locale]/privacy`'ye bağlanıyor;
ancak (i) metni i18n katalogunda değil, bileşende gömülü `isTr ? … : …` (CLAUDE.md kural 8'e
aykırı), (ii) _"analitik verilerini toplama için çerezleri kullanıyoruz"_ diyor — envanter §19
ise analitiğin bugün **ağ çağrısı yapmayan bir stub** olduğunu ölçmüş durumda. Bu, eksiklik
değil **fazla beyan**dır: kullanıcıya olmayan bir işleme anlatılıyor.

---

## 2. KVKK md.10 unsur-unsur hüküm tablosu

Ölçüm yüzeyi: `legal.privacy` (TR + EN) — yani §1.3'teki render kusuru **düzeltildiği varsayımıyla**,
katalogdaki metnin kendisi. (Bugünkü ekran hali için §1.3.)

| #   | md.10 unsuru                                                   | TR        | EN        | Hüküm gerekçesi + alıntı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | **Veri sorumlusunun ve varsa temsilcisinin kimliği**           | **YOK**   | **YOK**   | Katalogda tek ifade: _"{brand} SaaS Platformu olarak…"_ / _"{brand} SaaS Platform, …"_ — bu bir **ürün adıdır** (`src/lib/brand.ts` → `PRODUCT_NAME = 'FonBridge'`), tüzel kişi unvanı değil. Unvan, adres, VKN, MERSİS, KEP, e-posta: `messages/*.json` genelinde **0 e-posta adresi**, **0 KEP**, **0 MERSİS** (§8-K5). Temsilci (yurt dışında yerleşikse) hiç ele alınmamış. Ekranda bugün bu cümle **hiç basılmıyor** (§1.3) — bu yüzden hüküm KISMİ değil YOK.                                                                                           |
| b   | **Kişisel verilerin hangi amaçla işleneceği**                  | **KISMİ** | **KISMİ** | Alıntı (TR): _"Kullanıcı hesabı açma, oturum doğrulama, AB hibe çağrılarıyla eşleştirme, yapay zeka destekli teklif taslağı oluşturma ve abonelik faturalandırması süreçlerinde ad, e-posta, şirket/kurum bilgileri ve ödeme kayıtları işlenmektedir."_ → **5 amaç**. Envanter ise **18 faaliyet** beyan ediyor. Eşleşme analizi §3.1: 18'in **5'i** bu cümleyle örtüşüyor, **2'si kısmi**, **11'i metinde hiç geçmiyor**.                                                                                                                                    |
| c   | **İşlenen verilerin kimlere ve hangi amaçla aktarılabileceği** | **YOK**   | **YOK**   | Katalogda alıcı adı **sıfır**: Anthropic 0, OpenAI 0, Google 0, Microsoft 0, Stripe 0, Resend 0, Cloudflare 0, iyzico 0 (`legal.*` namespace içi, §8-K4). "yurt dışı" 0, "third country" 0, "ABD" 0, "alt işleyen" 0, "sub-processor" 0. Ham `alıcı` taraması 4 eşleşme veriyor ama dördü de **"k-alıcı"** kelimesinden gelen yanlış pozitif (`kalıcı olarak silinir`) — gerçek geçiş 0. Envanter §21 ise **8 alıcının 7'sinin ABD merkezli** olduğunu beyan ediyor.                                                                                          |
| ç   | **Toplama yöntemi ve hukuki sebebi**                           | **YOK**   | **YOK**   | Hukuki sebep: `hukuki sebep`/`legal basis` 0, `md.5`/`art.6` atfı 0, `meşru menfaat`/`legitimate interest` 0, `açık rıza`/`consent` 0, `sözleşmenin ifası` 0. Toplama yöntemi: `toplama yöntem` 0, `otomatik yol`/`automated means` 0, `çerez`/`cookie` 0 (§8-K6). Envanter ise **5 ayrı hukuki sebep** kullanıyor (md.5/2-c, md.5/2-ç, md.5/2-e, md.5/2-f, md.5/1 açık rıza). Metin bunların hiçbirini söylemiyor.                                                                                                                                           |
| d   | **md.11'de sayılan haklar**                                    | **KISMİ** | **KISMİ** | Alıntı (TR): _"KVKK 11. maddesi ve GDPR uyarınca verilerinizi dilediğiniz an … JSON biçiminde dışa aktarabilirsiniz. Aynı ekrandan hesabınızın silinmesini talep edebilirsiniz…"_ → md.11'e **atıf var**, ama anlatılan hak **2 tane**. Metinde `düzelt`/`rectif` 0, `itiraz`/`object to` 0, `tazminat`/`compensation` 0 (§8-K6). Ayrıca **başvuru kanalı yok**: `başvuru` 0 eşleşme, hiçbir e-posta/KEP/adres verilmiyor — hakkın nasıl kullanılacağı yalnızca uygulama içi ekrana bağlı, hesabı olmayan/erişimini yitirmiş ilgili kişi için kanal tanımsız. |

### 2.1 md.11 hak-hak kapsam ölçümü

| md.11 bendi | Hak                                                                                   | Metinde                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| a           | Kişisel verisinin işlenip işlenmediğini öğrenme                                       | **YOK**                                                                                                         |
| b           | İşlenmişse buna ilişkin bilgi talep etme                                              | **KISMİ** — dışa aktarma bunu fiilen karşılıyor, hak olarak adlandırılmıyor                                     |
| c           | İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme                  | **YOK**                                                                                                         |
| ç           | Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme                            | **YOK** (bkz. unsur c)                                                                                          |
| d           | Eksik/yanlış işlenmişse düzeltilmesini isteme                                         | **YOK**                                                                                                         |
| e           | Silinmesini/yok edilmesini isteme                                                     | **VAR** — 30 günlük süreçle birlikte anlatılıyor                                                                |
| f           | (d) ve (e) uyarınca yapılan işlemin aktarıldığı üçüncü kişilere bildirilmesini isteme | **YOK**                                                                                                         |
| g           | Münhasıran otomatik sistemlerle analiz sonucu aleyhe sonuca itiraz                    | **YOK** — ürün YZ ile puanlama üretiyor (M6 Evaluator Lens, envanter §9); bu hak ürün yüzeyiyle doğrudan ilgili |
| ğ           | Zarara uğrama hâlinde tazminat talep etme                                             | **YOK**                                                                                                         |

**9 bentten 1'i tam, 1'i kısmi, 7'si yok.**

### 2.2 Metnin kendi vaadiyle çelişkisi

`legal.privacy.metaDescription` (TR) kullanıcıya _"işlenen veriler, işleme amaçları, **saklama
süreleri** ve veri sahibi hakları"_ içeren bir politika vaat ediyor. Gövdede geçen tek süre
**30 günlük silme bekleme süresi**dir; envanterin saklama süresi alanlarında beyan edilen
diğer süreler (yasal saklama süresi, kalıcı saklama, TBK md.146 10 yıl varsayımı) metinde
**hiç geçmiyor**. Meta açıklaması, gövdenin taşımadığı bir içeriği vaat ediyor.

### 2.3 Durum güncellemesi — `a29711b0` + AKTAR-MURBCJ0A-1#privacy2 (02.10.2026)

Karşılaştırma yüzeyi: `messages/{tr,en}.json` → `legal.privacy.*` (bu daldaki hâli) ve `src/app/[locale]/privacy/page.tsx`. Tablo yukarıdaki §2 ölçümünü satır satır günceller; "hukukçu" sütunu metnin yayına çıkmadan önce hâlâ teyit beklediği yerleri gösterir.

| #   | md.10 unsuru | §2 ölçümü (10.09) | Bugün | Ne kapandı / ne açık |
| --- | --- | --- | --- | --- |
| a   | Veri sorumlusunun kimliği | YOK | **YOK (açık)** | Hâlâ yalnız ürün adı (`{brand}`). Unvan, adres, MERSİS, KEP metinde yok; `info@fonbridge.com` yalnız başvuru kanalı olarak geçiyor. Bilerek eklenmedi: tüzel kişi bilgisi patron kararı |
| b   | İşleme amaçları | KISMİ (5 amaç / 18 faaliyet) | **KISMİ, belirgin iyileşti** | `legalBasisBody` 19 faaliyeti adıyla sayıyor (envanterdeki 23 "Hukuki sebep" satırından 19 faaliyet; kalan 4'ün gerekçesi raporda). Amaç cümleleri hâlâ kısa; saklama süresi yok |
| c   | Aktarım: kime, ne amaçla | YOK | **KISMİ** | 7 alıcı adıyla ve ülke/bölgeyle yazılı: Anthropic, Google, Stripe, OpenAI, Cloudflare, PostHog, Vulut. Yurt dışı aktarımın hukuki dayanağı cümlesi **bilerek yazılmadı** (patron + hukukçu kararı; envanter §21: imzalı SCC yok). iyzico, Microsoft, Resend alıcı değil |
| ç   | Toplama yöntemi ve hukuki sebep | YOK | **VAR (hukukçu teyidi bekliyor)** | `collectionMethodHeading` (5 yol) ve `legalBasisHeading` (md.5/2-c, -ç, -e, -f, md.5/1) eklendi. Ajans kanalı ve ziyaretçi talebi envanterde hâlâ "taslak" |
| d   | md.11 hakları | KISMİ (1 tam, 1 kısmi, 7 yok) | **VAR (9/9)** | Dokuz bendin dokuzu `rightsBody`'de, ürün puanlaması g bendine bağlandı. Başvuru usulü (yazılı, KEP, güvenli e-imza, kayıtlı e-posta; 30 gün) `contactBody`'de. Posta/KEP **adresi** yazılmadı |

Önceki §2.1 tablosunun güncel sayımı: **9 bentten 9'u var** (önce 1 tam, 1 kısmi, 7 yok).

Hâlâ açık kalanlar (bu kartın kapsamı dışında bırakıldı):
1. Veri sorumlusu unvanı/adresi/KEP (md.10/1-a).
2. Saklama süreleri hiç yok (§2.2 çelişkisi sürüyor).
3. Yurt dışı aktarımın hukuki dayanağı cümlesi: patron + hukukçu kararı bekliyor.
4. `legal.privacy.metaDescription` hâlâ "saklama süreleri" vaat ediyor (gövde taşımıyor).
5. §1.3 render kusuru bu kartta ölçülmedi; ekran görüntüsünde gövde görünüyor (kanıt: rapor eki), ama kök neden kontrolü ayrı iş.

---

## 3. `processing-register.md` çapraz kontrolü — envanterde beyan edilip kullanıcıya söylenmeyenler

Envanter 18 işleme faaliyeti (§1–§18) ve 8 alıcı (§21) beyan ediyor. Aşağıda her biri
aydınlatma metniyle karşılaştırıldı. **Envanterde olup metinde olmayan her kalem bir
eksikliktir.**

### 3.1 Amaç kapsamı — 18 faaliyetin 12'si metinde yok

| §   | Envanterdeki faaliyet                | Metindeki amaç cümlesinde                                                                                                                                                                                                       |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hesap oluşturma ve kimlik doğrulama  | ✅ "Kullanıcı hesabı açma, oturum doğrulama"                                                                                                                                                                                    |
| 2   | Kiracı/ekip üyeliği ve davet         | ❌ **YOK** — davet edilen kişinin e-postası işleniyor, metin bundan söz etmiyor                                                                                                                                                 |
| 3   | Faturalama — Stripe                  | ✅ "abonelik faturalandırması"                                                                                                                                                                                                  |
| 4   | Faturalama — iyzico                  | ⚠️ aynı cümleye giriyor sayılabilir; sağlayıcı adı yok                                                                                                                                                                          |
| 5   | **VKN/TCKN ve e-Fatura**             | ❌ **YOK** — TCKN (gerçek kişi kimlik numarası, envanterin kendi ifadesiyle "özel önlem gerektirir") metinde hiç anılmıyor; metnin veri kategorisi listesi "ad, e-posta, şirket/kurum bilgileri ve ödeme kayıtları" ile sınırlı |
| 6   | YZ metin üretimi (LLM)               | ✅ "yapay zeka destekli teklif taslağı oluşturma"                                                                                                                                                                               |
| 7   | **YZ embedding / RAG**               | ❌ **YOK** — yüklenen belge metninin işlendiği metinde geçmiyor                                                                                                                                                                 |
| 8   | YZ kullanım günlüğü ve kredi         | ❌ **YOK**                                                                                                                                                                                                                      |
| 9   | İç ön değerlendirme (Evaluator Lens) | ❌ **YOK** — puan, kriter, zayıflık notu işleniyor; md.11/g (otomatik analiz) ile doğrudan ilgili                                                                                                                               |
| 10  | **Ortak/paydaş CRM (M4)**            | ❌ **YOK** — envanterin kendi ifadesiyle ilgili kişi "**platform kullanıcısı değildir, rızası/bilgisi olmayabilir**"; üçüncü kişiye yönelik ayrı aydınlatma yükümlülüğü doğar                                                   |
| 11  | Takvim entegrasyonu (OAuth token)    | ❌ **YOK** (envantere göre henüz aktif değil)                                                                                                                                                                                   |
| 12  | **Onay iş akışları (dual approval)** | ❌ **YOK** — envanter §12 madde 10 bu cümlenin _"A1/TASK-MTSWIFJKGTYC ile yayına alınacağını"_ zaten yazmış; `messages/*.json`'da karşılığı **bugün de yok**                                                                    |
| 13  | Denetim kaydı (audit log)            | ❌ **YOK**                                                                                                                                                                                                                      |
| 14  | Beta geri bildirim + ekran görüntüsü | ❌ **YOK** — ekran görüntüsü "kullanıcının ekranında görünen her şeyi içerebilir, maskeleme yok" (envanter §14)                                                                                                                 |
| 15  | Dosya/kanıt depolama (R2)            | ⚠️ 4. bölüm depolamayı **güvenlik önlemi** olarak anlatıyor, **işleme/aktarım** olarak değil                                                                                                                                    |
| 16  | Veri erişimi/taşınabilirlik          | ✅ 3. bölüm                                                                                                                                                                                                                     |
| 17  | Hesap silme ve zamanlanmış imha      | ✅ 3. bölüm                                                                                                                                                                                                                     |
| 18  | Kayıtlı arama uyarı e-postaları      | ❌ **YOK**                                                                                                                                                                                                                      |

**Toplam: 5 ✅ · 2 ⚠️ (kısmi) · 11 ❌ = 18.** Yani 11 faaliyetin metinde **hiçbir** karşılığı yok, 2'si kısmi — **13 faaliyet eksik beyan**. §5 (TCKN) ve §10 (üçüncü kişi verisi) ayrıca ağırlaştırıcıdır.

### 3.2 ⛔ YURT DIŞI AKTARIM — envanter §21'in 8 satırının 8'i de metinde yok

| Alıcı                 | Ülke (envanter)     | Aktarılan veri                  | Metinde adı geçiyor mu                                                                 |
| --------------------- | ------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| Anthropic PBC         | ABD                 | LLM istem metni (§6)            | **HAYIR** (0 eşleşme)                                                                  |
| OpenAI, L.L.C.        | ABD                 | Embedding için belge metni (§7) | **HAYIR** (0)                                                                          |
| Google LLC            | ABD                 | OAuth giriş bilgisi (§1)        | **HAYIR** (0)                                                                          |
| Microsoft Corporation | ABD                 | OAuth giriş bilgisi (§1)        | **HAYIR** (0)                                                                          |
| Stripe, Inc.          | ABD                 | Ödeme (§3)                      | **HAYIR** (0 — `legal.*` içinde; katalogda 38 geçiş var ama tamamı faturalama UI'ında) |
| Resend                | ABD                 | E-posta adresi (§17, §18)       | **HAYIR** (0)                                                                          |
| Cloudflare, Inc.      | Hesap ayarına bağlı | Dosya/ekran görüntüsü (§15)     | **HAYIR** (0)                                                                          |
| iyzico                | Türkiye             | Ödeme (§4)                      | **HAYIR** (0) — yurt dışı değil, yine de alıcı                                         |

Metin "yurt dışı"/"third country"/"ABD" kelimelerinin **hiçbirini** içermiyor. KVKK md.9
(yurt dışına aktarım) rejimi ve md.10/1-c unsuru için bu tek başına en büyük boşluktur.

Envanter §21 ayrıca **hiçbir alıcı için repoda imzalı SCC/ek sözleşme bulunamadığını** ölçmüş
durumda ("envanterin en büyük tekil boşluğu"). Aydınlatma metninde aktarımın hukuki
mekanizmasının (açık rıza mı, md.9/2 güvenceleri mi) hangisi olduğu da bu yüzden yazılamaz —
**önce mekanizma kararı, sonra metin**. Sıralama bağımlılığı §7'de kayıtlıdır.

### 3.3 Ters yön — metinde olup envanterde doğrulanmayan iddialar

Aydınlatma metninin kendisi doğru olmayan bir şey söylemiyor; ancak **aynı sayfada olmayan ama
aynı sitede duran** iki iddia envanterle çelişiyor ve hukukçunun bilmesi gerekir:

1. `src/components/PublicFooter.tsx:145` — genel yerleşimde her kamuya açık sayfada
   _"🇪🇺 Frankfurt & Istanbul Data Centers"_ ve _"256-bit AES Encryption"_ basılıyor
   (`/tr` render'ında doğrulandı). Envanter §15 ise Cloudflare R2 için _"kod düzeyinde AB
   bölgesi zorlaması **YOK — açık**, … 'AB bölgesi (Frankfurt) varsayılan' iddiası repoda
   doğrulanamadı"_ diyor. Kullanıcıya gösterilen konum iddiası envanterde doğrulanmamıştır.
   **Güncel 29.09.2026 (TASK-MUN2UXWTAX1AQ):** iddia kaldırıldı. Barındırma kararı Vulut,
   Türkiye (patron). Altbilgi artık _"🇹🇷 Veritabanı Türkiye'de barındırılır"_ / _"🇹🇷 Database
   hosted in Türkiye"_ diyor (i18n `landing.footer.dataResidency`); "EU Cloud" rozeti ve açılış
   sayfasındaki "GDPR & EU Cloud Ready" da kaldırıldı. "256-bit AES Encryption" hâlâ doğrulanmadı.
2. Çerez banner'ı analitik çerez topladığını söylüyor; envanter §19 analitiğin ağ çağrısı
   yapmayan bir stub olduğunu ölçmüş (bkz. §1.4).

Bu ikisi **eksiklik değil, fazla/yanlış beyan**dır ve düzeltmeleri hukuk girdisi beklemez.

---

## 4. Veri sorumlusu kimliği — bugün kodda ve dokümanlarda ne var

### 4.1 Ölçüm

| Kimlik unsuru          | Bugün nerede geçiyor                  | Değer                                                                                                           | Aydınlatma metninde                                                                                                                                                                              |
| ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ürün adı**           | `src/lib/brand.ts:19`                 | `PRODUCT_NAME = 'FonBridge'` (2026-09-10'da patron direktifiyle geri alındı)                                    | `{brand}` yer tutucusu olarak — **basılmıyor** (§1.3)                                                                                                                                            |
| **Tüzel kişi unvanı**  | `docs/EFATURA_SETUP.md:38`            | **`FonBridge Ltd. Şti.`** (patron kararı, 2026-09-08)                                                           | **YOK**                                                                                                                                                                                          |
| **VKN**                | `docs/EFATURA_SETUP.md:39`            | Yalnızca **örnek** `1234567890`; gerçek değer yalnızca `INVOICE_SUPPLIER_VKN` ortam değişkeninde, repoda değil  | **YOK**                                                                                                                                                                                          |
| **Vergi dairesi**      | `docs/EFATURA_SETUP.md:40`            | Örnek `Doğanbey V.D.`                                                                                           | **YOK**                                                                                                                                                                                          |
| **Merkez adresi**      | `docs/EFATURA_SETUP.md:41-42`         | Örnek `Kızılırmak Mah. 1450. Cad. No:3` / `Ankara`                                                              | **YOK**                                                                                                                                                                                          |
| **MERSİS**             | —                                     | Repoda hiç geçmiyor (0 eşleşme)                                                                                 | **YOK**                                                                                                                                                                                          |
| **KEP adresi**         | —                                     | Repoda hiç geçmiyor (`messages/*.json`'daki tek "kep" eşleşmesi İngilizce _"kept"_ kelimesinden yanlış pozitif) | **YOK**                                                                                                                                                                                          |
| **İletişim e-postası** | `src/components/PublicFooter.tsx:136` | ~~`info@usfinbridge.com`~~ → `info@fonbridge.com` (**29.09.2026:** canlı alan adı `fonbridge.com`; `usfinbridge.com` iptal) — **kodda gömülü**, i18n katalogunda değil                                               | **YOK** — üstelik `/[locale]/privacy` sayfası PublicFooter'ı **render etmiyor** (üç yasal sayfanın üçünde de `info@usfinbridge.com` yok), yani metnin üzerinde hiçbir iletişim kanalı görünmüyor |

`INVOICE_SUPPLIER_*` ortam değişkenleri **bir kimlik taşıyor** (`src/lib/env.ts:65-71`: NAME,
VKN, TAX_OFFICE, ADDRESS, CITY, COUNTRY, EMAIL) ve fatura belgesine basılıyor
(`src/app/api/billing/invoices/[id]/export/route.ts:119-125`). Yani ürün **fatura tarafında bir
tüzel kişi kimliği beyan edebiliyor**, aydınlatma tarafında **hiçbir kimlik beyan etmiyor.**
Aynı tüzel kişi mi sorusunun cevabı repoda yok — ortam değişkenlerinin canlı değerleri
okunmadı (ve okunmamalı).

### 4.2 Ölçülen çelişkiler

1. **Ürün adı ile doküman drift'i.** `docs/EFATURA_SETUP.md:38` _"Bu tüzel kişi unvanıdır, ürün
   adı değil: ürün **Fabrika**"_ diyor. `src/lib/brand.ts:19` ise bugün `'FonBridge'` döndürüyor
   (aynı dosyanın yorumu: _"returned to 'FonBridge' on 2026-09-10 per patron directive"_).
   Doküman satırının açıklayıcı yarısı bugün yanlıştır; **satırın hükmü (unvanın yeniden
   adlandırma taramasıyla değiştirilmeyeceği) geçerlidir**, yalnızca "ürün Fabrika" ifadesi
   eskimiştir.
2. **DPA sayfası başka bir taraf adı kullanıyor.** `docs/legal/dpa-tr.md:7` / `dpa-en.md:7`:
   _"…**Fabrika** SaaS platformunu kullanan kurumsal müşteri … platformu işleten **Fabrika**…"_.
   `/tr/compliance/dpa` render'ında bu metin bugün de aynen basılıyor. Aynı sitede aydınlatma
   metni `{brand}` (=FonBridge), footer "FonBridge (FonBridge SaaS)", DPA "Fabrika" diyor.
   **Sözleşmenin tarafı adıyla belirsizdir.**
3. **Dört ayrı alan adı, tek kanonik kimlik yok.** Test/örnek dosyaları hariç `src/` içinde:
   `usfinbridge.com` (`info@`, `demo@`, `noreply@` — o gün `src/lib/env.ts:49` varsayılan gönderen),
   **29.09.2026 notu:** canlı alan adı `fonbridge.com`; `usfinbridge.com` iptal. Varsayılan gönderen
   artık `info@fonbridge.com` (`src/lib/env.ts:99`, `NEXT_PUBLIC_SMTP_FROM_ADDRESS`); altbilgi iletişim
   adresi de `info@fonbridge.com`. `usfinbridge.com` yalnız demo hesaplarında kaldı
   (`src/lib/auth.ts:84`, `src/app/[locale]/login/AuthCard.tsx:37`).
   `fabrika.app` (API örnekleri, `docs.fabrika.app`, takvim UID'leri),
   `fabrika.dev` (`support@`, `feedback@`, `app.fabrika.dev` — `src/lib/beta/constants.ts:49-51`),
   **01.10.2026 notu:** beta `support@`/`feedback@` varsayılanları `info@fonbridge.com`'a taşındı
   (TASK-MUPIR7Y1P7AH4); `app.fabrika.dev` artık `src/`'de yok (`src/lib/app-url.ts`). Kalan tek iz
   takvim UID'lerindeki `@fabrika.dev` (`src/lib/beta/checkin-schedule.ts`) — posta adresi değil.
   `yasinaslan.com.tr` (`admin@` — platform yöneticisi kimliği, `src/lib/auth.ts:30`).
   Aydınlatma metninin başvuru kanalı olarak hangisini göstereceği **karar konusudur**.

---

## 5. Ölçülemeyenler — ve nasıl ölçülür

Bu kart kapsamında **ölçülemeyen** ve bu yüzden "muhtemelen yeterli/yetersiz" denmeyen kalemler:

| Ölçülemeyen                                                                 | Neden                                                                                          | Nasıl ölçülür                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVOICE_SUPPLIER_*` canlı değerleri gerçek tüzel kişiyi mi taşıyor         | Ortam değişkenleri repoda yok; `.env*` dosyaları bilinçli olarak okunmadı (sır sızdırma riski) | Üretim ortamında `/api/billing/invoices/<no>/export` çıktısındaki `<cac:AccountingSupplierParty>` bloğunun **maskeli** bir örneği alınıp unvanla karşılaştırılır; ya da dağıtım ortamı değişken listesi (değer değil, **dolu/boş** durumu) alınır |
| Ticaret sicil/MERSİS/KEP değerleri                                          | Repoda hiçbir yerde yok                                                                        | Hukuk/mali müşavir kaydından alınır — `docs/MALI_MUSAVIR_SORULARI.md` zaten açık bir soru kanalı                                                                                                                                                  |
| Cloudflare R2 kovasının gerçek bölgesi                                      | Kod değil hesap ayarı (envanter §15 aynı sonuca varmış)                                        | Cloudflare hesabında R2 bucket'ın `location hint`/jurisdiction ayarının ekran görüntüsü; ya da `HEAD` yanıtındaki `cf-r2-*` başlıkları                                                                                                            |
| Resend'in veri işleme bölgesi                                               | Repoda bölge bilgisi yok (envanter §21 aynı)                                                   | Sağlayıcı DPA'sı / hesap ayarları                                                                                                                                                                                                                 |
| Aydınlatma metninin kullanıcıya **fiilen ulaşıp ulaşmadığı** (görüntülenme) | Analitik stub, ölçüm yok (envanter §19)                                                        | Ölçmek için sunucu tarafı sayaç gerekir; **bu kart bunu önermez** — analitik eklemek yeni bir işleme faaliyetidir ve kendi envanter maddesini gerektirir                                                                                          |
| Üçüncü kişilerin (M4 CRM muhatapları) aydınlatılıp aydınlatılmadığı         | Kod tabanında muhatap aydınlatma/silme formu bulunamadı (envanter §10, açık)                   | `SECURITY_COMPLIANCE.md:101`'de iddia edilen "herkese açık muhatap silme isteği formu" rotasının var olup olmadığı `src/app` taraması ile; bulunamadıysa iddia geri çekilir                                                                       |

---

## 6. ŞABLON — hukukçunun dolduracağı iskelet

Aşağıdaki iskelet `messages/{tr,en}.json` → `legal.privacy` altına gidecek bölümlerin
**yapısıdır**. İçindeki hiçbir cümle yazılmamıştır; her `<<HUKUK: …>>` bir boşluktur ve
yanındaki cümle **hukukçudan tam olarak ne istendiğini** söyler.

> **İki dil kuralı:** her bölüm TR ve EN olarak ayrı ayrı gelir (CLAUDE.md kural 8 — yeni anahtar
> iki dile de eklenir). EN sürümü TR'nin çevirisi değil, **GDPR art.13/14 karşılığıdır**; hangi
> unsurun iki rejimde farklı yazılacağına hukuk karar verir.

### Bölüm 1 — Veri sorumlusunun kimliği _(md.10/1-a)_

- `<<HUKUK: TÜZEL KİŞİ UNVANI>>` — _Ticaret sicilindeki tam unvan. Ölçülen aday: `FonBridge Ltd. Şti.` (`docs/EFATURA_SETUP.md:38`, patron 2026-09-08); teyit ve nihai yazım hukukçudan._
- `<<HUKUK: MERSİS NO>>` — _Repoda hiç geçmiyor; sicil kaydından._
- `<<HUKUK: VKN VE VERGİ DAİRESİ>>` — _Aydınlatma metninde gösterilip gösterilmeyeceği de dahil karar hukukçunun; fatura tarafındaki `INVOICE_SUPPLIER_VKN` ile tutarlı olmalı._
- `<<HUKUK: MERKEZ ADRESİ>>` — _Tebligata elverişli adres._
- `<<HUKUK: KEP ADRESİ>>` — _Repoda yok; KVKK Başvuru Usul ve Esasları Tebliği'nin aradığı kanal._
- `<<HUKUK: BAŞVURU E-POSTASI>>` — _Dört aday alan adı ölçüldü (§4.2/3); hangisinin kanonik olacağı karar konusu._
- `<<HUKUK: TEMSİLCİ (VARSA)>>` — _Yurt dışında yerleşik değilse "yok" yazılması da bir karardır; boş bırakılmaz._
- `<<HUKUK: AB TEMSİLCİSİ VE DPO (GDPR art.27/37) — GEREKLİ Mİ>>` — _Gerekli değilse gerekçesi kayda geçsin; EN sürümde okuyucu bunu arar._

### Bölüm 2 — İşlenen veri kategorileri ve işleme amaçları _(md.10/1-b)_

Ölçüm: envanterdeki 18 faaliyetin 12'si bugünkü metinde karşılıksız (§3.1).

- `<<HUKUK: 18 FAALİYETİN HANGİLERİ TEK TEK, HANGİLERİ KATEGORİ ALTINDA ANLATILACAK>>` — _Envanterin faaliyet ayrımı ile aydınlatma metninin okunabilirliği arasındaki dengeyi hukukçu kurar; §3.1 tablosu girdidir._
- `<<HUKUK: TCKN/VKN İÇİN AYRI PARAGRAF GEREKLİ Mİ>>` — _Envanter §5, şahıs şirketi mükellefte TCKN'nin doğrudan kimlik numarası olduğunu ve özel önlem gerektirdiğini beyan ediyor; bugünkü metnin veri kategorisi listesinde hiç geçmiyor._
- `<<HUKUK: YZ İŞLEMESİ İÇİN AYRI PARAGRAF>>` — _Envanter §6-§9: istem metni, yüklenen belge, kullanım günlüğü ve otomatik ön değerlendirme dört ayrı faaliyet; kullanıcıya kaç paragrafta anlatılacağı karar konusu._
- `<<HUKUK: ÜÇÜNCÜ KİŞİ VERİSİ (M4 CRM) İÇİN AYRI AYDINLATMA GEREKLİ Mİ>>` — _Envanter §10'un ilgili kişisi platform kullanıcısı değil; ayrı bir yüzey mi, bu metnin bir bölümü mü olacağına hukukçu karar verir._
- `<<HUKUK: ONAY KAYDI (DUAL APPROVAL) BEYAN CÜMLESİ>>` — _Envanter §12 madde 10 bu cümleyi "A1 ile yayına alınacak" diye bekletiyor; bugün `messages/*.json`'da yok._

### Bölüm 3 — Aktarım: kime, hangi amaçla _(md.10/1-c, md.9)_

Ölçüm: envanter §21'in 8 alıcısının **8'i de** metinde geçmiyor (§3.2).

- `<<HUKUK: ALICILAR ADIYLA MI, KATEGORİ OLARAK MI SAYILACAK>>` — _Ad ile sayım alıcı değişince metin güncellemesi gerektirir; kategori ile sayım daha az bilgilendiricidir. Karar hukukçunun._
- `<<HUKUK: YURT DIŞI AKTARIM HUKUKİ MEKANİZMASI>>` — _Açık rıza mı, md.9/2 güvenceleri mi (taahhütname/BCR/yeterlilik kararı)? Envanter §21: repoda **hiçbir alıcı için imzalı SCC/ek yok**. Metin yazılmadan önce bu karar gerekir — bkz. §7 bağımlılık._
- `<<HUKUK: AÇIK RIZA SEÇİLİRSE RIZANIN ALINACAĞI YÜZEY>>` — _Bugün kayıt ekranında hiçbir aydınlatma/onay yüzeyi yok (§1.4); rıza modeli seçilirse ürün tarafında yeni bir ekran gerekir._
- `<<HUKUK: HER ALICI İÇİN AKTARIM AMACI>>` — _Envanter §21 aktarılan veriyi yazıyor, amacı ilgili faaliyet maddesinde; metne hangi ayrıntının gireceği karar konusu._

### Bölüm 4 — Toplama yöntemi ve hukuki sebep _(md.10/1-ç)_

Ölçüm: metinde 0 hukuki sebep ifadesi, 0 toplama yöntemi ifadesi (§2).

- `<<HUKUK: TOPLAMA YÖNTEMİ>>` — _Elektronik ortamda otomatik/kısmen otomatik yollarla; kullanıcı girişi, OAuth sağlayıcı, dosya yükleme, çerez — hangilerinin sayılacağı karar konusu._
- `<<HUKUK: HER AMAÇ İÇİN HUKUKİ SEBEP>>` — _Envanterde 5 ayrı sebep kullanılıyor (md.5/2-c, md.5/2-ç, md.5/2-e, md.5/2-f, md.5/1). Envanterin sebep atamalarının **hukuken doğrulanması** ve metne hangi ayrıntıda yansıyacağı hukukçudan._
- `<<HUKUK: MEŞRU MENFAAT DENGELEME TESTİ GEREKLİ Mİ>>` — _Envanterin 8 faaliyeti md.5/2-f'e dayanıyor (§6, §7, §8, §9, §10, §12, §14, §18); dengeleme testi belgesi repoda yok._
- `<<HUKUK: ÇEREZ AYDINLATMASI AYRI BELGE Mİ>>` — _Bugünkü banner metni koda gömülü ve envanterle çelişiyor (§1.4)._

### Bölüm 5 — İlgili kişinin md.11 hakları ve başvuru usulü _(md.10/1-ç son cümle)_

Ölçüm: 9 bentten 1'i tam, 1'i kısmi, 7'si yok (§2.1).

- `<<HUKUK: MD.11 BENTLERİNİN TAM LİSTESİ>>` — _§2.1 tablosundaki 7 eksik bent metne girecek; bentlerin kanun diliyle mi sadeleştirilmiş dille mi yazılacağı karar konusu._
- `<<HUKUK: MD.11/g (OTOMATİK ANALİZ) İÇİN ÜRÜNE ÖZEL AÇIKLAMA>>` — _Ürün YZ ile ön değerlendirme puanı üretiyor (envanter §9). CLAUDE.md'nin "Evaluator Lens çıktısı resmî puan değildir" kuralıyla tutarlı bir çerçeve gerekir._
- `<<HUKUK: BAŞVURU USULÜ VE KANALI>>` — _Yazılı/KEP/e-posta; 30 günlük cevap süresi. Bugün metinde başvuru kelimesi hiç geçmiyor ve yasal sayfalarda iletişim kanalı görünmüyor (§4.1)._
- `<<HUKUK: HESABI OLMAYAN İLGİLİ KİŞİ İÇİN KANAL>>` — _Bugün haklar yalnızca uygulama içi ekrana bağlı; silinmiş/erişimi olmayan kullanıcı ve M4 CRM muhatapları için kanal tanımsız._
- `<<HUKUK: KVKK KURULUNA ŞİKÂYET HAKKI CÜMLESİ>>` — _md.14 yolu; bugünkü metinde yok._

### Bölüm 6 — Saklama süreleri

- `<<HUKUK: HER KATEGORİ İÇİN SAKLAMA SÜRESİ>>` — _Envanterde 5 kalem "açık/tanımsız" (§22): VKN/TCKN süresi, `Document`/`Chunk`, `AuditEvent`, geri bildirim/ekran görüntüsü, onay kaydı (TBK md.146 10 yıl **varsayımı** — envanter §12 madde 8 bunun "hukuk ekibinin onayladığı nihai süre olmadığını" açıkça yazıyor)._
- `<<HUKUK: KİŞİSEL VERİ SAKLAMA VE İMHA POLİTİKASI AYRI BELGE Mİ>>` — _Yönetmelik ayrı bir politika arıyor; repoda yok._

### Bölüm 7 — Yürürlük ve değişiklik

- `<<HUKUK: SÜRÜM VE YÜRÜRLÜK TARİHİ>>` — _DPA'da sürüm/yürürlük satırı var (`Sürüm 1.0 — 2026-09-06`), aydınlatma metninde yok._
- `<<HUKUK: DEĞİŞİKLİK BİLDİRİM USULÜ>>`

---

## 7. Hukuk girdisi geldiğinde açılacak kart — TASLAK (kart AÇILMADI)

> Bu bölüm bir **taslaktır**. Bu kart kapsamında Task Board'da yeni kart **açılmamıştır**.

**Önerilen başlık:** `Aydınlatma metnini KVKK md.10 unsurlarıyla yayına al (hukuk girdisi sonrası)`

**Bağımlılık (sıralı, atlanamaz):**

1. §6 şablonundaki `<<HUKUK: …>>` alanları doldurulmuş TR + EN metin teslim edilmiş olmalı.
2. Yurt dışı aktarım mekanizması kararı (§6/Bölüm 3) verilmiş olmalı — açık rıza seçilirse
   kart kapsamı **kayıt akışında rıza yüzeyi** eklemeyi de içerir, aksi hâlde içermez.

**Kabul kriteri taslağı:**

- [ ] `src/app/[locale]/privacy/page.tsx` `{brand}` interpolasyonunu geçiriyor; `/tr/privacy` ve
      `/en/privacy` görünür metninde `legal.` ile başlayan anahtar yolu **0 adet**; sunucu
      günlüğünde `FORMATTING_ERROR` **0 adet**. _(Aynı düzeltme `terms` ve `compliance/dpa`
      sayfaları için de — üçünün `<title>` etiketi de bugün anahtar yolu basıyor.)_
- [ ] md.10'un beş unsurunun beşi de `legal.privacy` altında **TR ve EN** karşılığıyla var;
      §2 tablosundaki YOK/KISMİ hükümlerinin tamamı VAR'a dönmüş.
- [ ] md.11'in 9 bendinin 9'u metinde sayılı (§2.1 tablosu yeniden koşturulup kanıtlanır).
- [ ] Envanter §21'deki 8 alıcının tamamı, aktarım amacı ve hukuki mekanizmasıyla metinde;
      "yurt dışı aktarım" başlığı mevcut.
- [ ] Envanter §3.1'deki 11 karşılıksız + 2 kısmi faaliyetin her biri metinde bir karşılık bulmuş
      (tek tek ya da hukukçunun onayladığı kategori altında — hangisi olduğu kartta yazılı).
- [ ] Veri sorumlusu kimliği (unvan, adres, MERSİS/VKN, KEP/e-posta) metinde; `INVOICE_SUPPLIER_NAME`
      ile **aynı tüzel kişi** olduğu doğrulanmış; DPA'daki taraf adı (`Fabrika`) da aynı unvanla
      hizalanmış.
- [ ] Kayıt/giriş akışında aydınlatma metnine bağlantı var (bugün 0 — §1.4).
- [ ] Kullanıcıya gösterilen doğrulanmamış iddialar temizlenmiş: PublicFooter'daki
      "Frankfurt & Istanbul Data Centers" ya kanıtlanmış ya kaldırılmış (**kaldırıldı 29.09.2026,
      TASK-MUN2UXWTAX1AQ**; "256-bit AES Encryption" açık); çerez banner'ı i18n'e
      taşınmış ve envanterle tutarlı hâle gelmiş (§3.3).
- [ ] `processing-register.md` §12 madde 10'daki "aydınlatma metni durumu: TASLAK — yayında değil"
      satırı güncellenmiş.
- [ ] `pnpm gate` temiz; `/tr/privacy` ve `/en/privacy` için gerçek tarayıcı e2e ile
      (offscreen değil) metnin bölümleri ekranda doğrulanmış, önce/sonra kare kaydı raporda.

**Kapsam dışı:** aydınlatma metninin **hukuki içeriği** (hukuk ekibi yazar); SCC/ek sözleşme
imzalanması (ayrı iş); analitik ekleme (yeni işleme faaliyeti — kendi kartı ve envanter maddesi
gerekir).

---

## 8. Ölçüm komutları (yeniden koşturulabilir)

Tüm ölçümler 2026-09-10'da, macOS (darwin 25.6.0), Node v26.5.0, next-intl 4.14.2 ile alındı.

**K1 — canlı render (dev sunucu :3117):**

```bash
pnpm dev -p 3117
for L in tr en; do curl -s http://localhost:3117/$L/privacy | python3 -c "
import sys,re,html
h=sys.stdin.read(); t=re.search(r'<title>(.*?)</title>',h,re.S); print('TITLE:', html.unescape(t.group(1)))
print('BODY-P:', html.unescape(re.sub(r'<[^>]+>','',re.findall(r'<p[^>]*>(.*?)</p>',h,re.S)[0]))[:80])"; done
```

**K2 — görünür metindeki anahtar yolu sızıntısı:** `curl … | python3` ile `<script>` blokları
atıldıktan sonra `\b(?:legal|settings|common)\.[a-zA-Z.]+` araması.

**K3 — sunucu günlüğü:** `grep -c "FORMATTING_ERROR" dev.log` → `18`;
`grep -o 'was not provided to the string "[^"]\{0,60\}' dev.log | sort -u` → 6 farklı dize.

**K4 — alıcı adı taraması (`legal.*` namespace içi):**

```bash
node -e "const s=['tr','en'].map(l=>JSON.stringify(require('./messages/'+l+'.json').legal||{})).join(' ');
for (const t of ['Anthropic','OpenAI','Google','Microsoft','Stripe','Resend','Cloudflare','iyzico','yurt dışı','ABD'])
  console.log(t, (s.match(new RegExp(t,'gi'))||[]).length);"
```

**K5 — kimlik unsurları:** `messages/*.json` genelinde e-posta regex → **0**; `KEP` → 1
(İngilizce "kept" yanlış pozitifi); `MERSİS` → **0**.

**K6 — md.10/md.11 anahtar kelime taraması:** `legal.privacy` + `settings.privacy` birleşik
dizesinde 15 desen; sonuçlar §2 ve §2.1 tablolarında.

**K7 — kimlik çelişkileri:**

```bash
grep -rn "INVOICE_SUPPLIER" src/ docs/ --include="*.ts" --include="*.md"
grep -rn "Fabrika" docs/legal/dpa-tr.md docs/legal/dpa-en.md
grep -rn "usfinbridge\.com\|fabrika\.app\|fabrika\.dev" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```

**Not:** `.env`, `.env.local` ve benzeri dosyalar **bilinçli olarak okunmadı**; `INVOICE_SUPPLIER_*`
canlı değerleri bu analizin girdisi değildir (§5).

# e-Fatura yapılandırması — doldurulacak ortam değişkenleri

**Durum: e-Fatura entegrasyonu CANLI DEĞİL.** Fabrika'nın bir özel entegratör
sözleşmesi yok; bugüne kadar hiçbir belge GİB'e gönderilmedi. Aşağıdaki
değişkenler doldurulana kadar uygulama çalışmaya devam eder — sadece fatura
üretimi ve gönderimi kapalı kalır ve bunu açıkça söyler.

İki ayrı şey var, karıştırmayın:

| | Ne yapar | Olmadan ne olur |
|---|---|---|
| **Satıcı kimliği** (`INVOICE_SUPPLIER_*`) | Faturanın üzerindeki "kimden" bilgisi | Fatura **belgesi üretilmez**: `/api/billing/invoices/<no>/export` → `503 supplier_identity_not_configured` (eksik değişkenlerin adıyla) |
| **Entegratör** (`EFATURA_INTEGRATOR_*`) | Belgeyi GİB'e ileten lisanslı aracı | Belge üretilir ama **GİB'e gönderilmez**; üzerinde "ÖRNEK BELGE — mali değeri yoktur" damgası kalır |

Kural (patron kararı): belge yalnızca gerçek `Invoice` kaydından üretilir, kayıt
yoksa `404`. Sahte belge üretilmez, uydurma VKN yazılmaz.

**Üçüncü şey (TASK-MTSWL8ADKZKDM): alıcı kimliği.** Ödeme başarılı olduğunda artık
gerçekten bir `Invoice` satırı yazılıyor (Stripe ve iyzico, tek ortak fonksiyondan:
`src/lib/billing/invoice-writer.ts`). Ama fatura alıcının mali kimliğini de gerektirir ve
o kimlik `TenantBillingIdentity` tablosundan okunur. Kiracının satırı yoksa **fatura
kesilmez**: ödeme kaydı yerinde kalır, `SystemAlert` (`invoice_buyer_identity_missing`)
eksik alanları adıyla sayar. Uydurma VKN yazılmaz.

⚠️ **Go-live için açık iş:** bu satırı dolduran bir ürün ekranı **henüz yok**. O ekran
(ya da bir toplu içe aktarma) yazılana kadar canlıda kesilecek fatura sayısı **sıfırdır** —
`INVOICE_SUPPLIER_*` ve `EFATURA_INTEGRATOR_*` doldurulsa bile. Ayrı kart gerekiyor.

⚠️ **`profileId` bugün varsayım.** Alıcının GİB'de e-Fatura mükellefi olup olmadığı
entegratör sorgusu ister; sözleşme yokken bilinemiyor. `EARSIVFATURA` yazılıyor ve her
kesimde `invoice_profile_assumed` uyarısı düşüyor. İlk gerçek gönderimden **önce** bu
değeri taşıyan satırlar mükellef sorgusuyla yeniden profillenmeli.

## Doldurulacak tablo

| Değişken | Nereden alınır | Örnek biçim | Zorunlu |
|---|---|---|---|
| `INVOICE_SUPPLIER_NAME` | Ticaret sicilindeki tam unvan — **`FonBridge Ltd. Şti.`** (patron, 2026-09-08). Bu **tüzel kişi unvanıdır**, ürün adı değil: ürün **Fabrika**. `src/lib/brand.ts` "FonBridge artık taşınmıyor" derken ÜRÜN adını kasteder; buradaki unvan bir yeniden adlandırma taramasıyla DEĞİŞTİRİLMEZ. | `FonBridge Ltd. Şti.` | evet |
| `INVOICE_SUPPLIER_VKN` | Vergi levhası — 10 haneli VKN | `1234567890` | evet |
| `INVOICE_SUPPLIER_TAX_OFFICE` | Vergi levhası — bağlı olunan vergi dairesi | `Doğanbey V.D.` | evet |
| `INVOICE_SUPPLIER_ADDRESS` | Sicildeki merkez adresi (sokak/no) | `Kızılırmak Mah. 1450. Cad. No:3` | evet |
| `INVOICE_SUPPLIER_CITY` | Merkez adresin ili | `Ankara` | evet |
| `INVOICE_SUPPLIER_COUNTRY` | Ülke | `Türkiye` (boşsa varsayılan) | hayır |
| `INVOICE_SUPPLIER_EMAIL` | Muhasebe e-postası (UBL-TR zorunlu kılmaz) | `muhasebe@ornek.com` | hayır |
| `EFATURA_INTEGRATOR_PROVIDER` | Sözleşme yapılan özel entegratörün adı | `uyumsoft` | evet* |
| `EFATURA_INTEGRATOR_BASE_URL` | Entegratörün verdiği API adresi (test/canlı ayrı) | `https://efatura-test.ornek.com` | evet* |
| `EFATURA_INTEGRATOR_USERNAME` | Entegratörün açtığı API kullanıcısı | `fabrika_api` | evet* |
| `EFATURA_INTEGRATOR_PASSWORD` | Aynı hesabın parolası/anahtarı — **repoya yazılmaz**, sır yöneticisine | `••••••••` | evet* |
| `EFATURA_INTEGRATOR_TEST_MODE` | Canlıya geçerken `false` yapılır | `false` | hayır (varsayılan: test) |

\* Yalnızca GİB'e gönderim için zorunlu. Dördü birden dolmadan gönderim
denenmez; eksik olan(lar) adıyla raporlanır (`not_configured`).

## Doldurduktan sonra ne olur

- Satıcı kimliği tamamlanınca `/api/billing/invoices/<fatura-no>/export?format=xml|pdf`
  gerçek `Invoice` satırından UBL-TR 1.2.1 belgesi üretir.
- Entegratör bilgileri tamamlansa **bile** gönderim henüz gerçekleşmez: o
  entegratörün API'sine karşı bir adaptör yazılması gerekir
  (`ADAPTERS` — `src/lib/efatura-integrator.ts`). Adaptör yokken sonuç
  `provider_unsupported` döner; asla "gönderildi" denmez.
- Bir belge ancak GİB'in döndürdüğü zarf numarası (`Invoice.gibEnvelopeId`)
  kaydedildiğinde "GİB'e gönderildi" sayılır. Ayarlar → Faturalandırma panelinde
  ve basılan belgede tek ölçüt budur.
- **Kur kaydı taşıyan TRY dışı fatura artık gönderilebilir; taşımayan hâlâ
  gönderilemez.** `fileThrough`, TCMB kuru ve TL karşılığı olmayan bir döviz
  belgesini adaptöre hiç ulaştırmadan `blocked` /
  `FOREIGN_CURRENCY_NO_TL_EQUIVALENT` ile geri çevirir (VUK 215 / 385 Sıra
  No.lu Genel Tebliğ). ADR-0002 2026-09-08'de Seçenek (b) ile karara bağlandı ve
  Faz 2 (`TASK-MTT13PK0Z4ZLB`) indi: `Invoice` satırı artık `fxRate`,
  `fxRateDate`, `fxRateSource` ve `grandTotalTryMinor` taşıyor; kur ve TL
  karşılığı ayrıca **basılan belgeye ve XML'e yazılır** (toplamlar tablosunda
  "TL karşılığı" satırı, XML'de `cbc:Note` — VUK 215, QA 3. tur F-4), UBL-TR XML'i
  `PricingExchangeRate`/`TaxExchangeRate` bloklarını yazıyor ve engel yalnız
  **kaydı olmayan** belgede kalıyor. Belge *üretimi* (export) her iki durumda da
  etkilenmez: zarf numarası olmayan belge zaten "mali değeri yoktur" damgası
  taşır (TASK-MTSWLWDONWA3W).

### TCMB kuru — 14. bir değişken YOKTUR

TCMB'nin günlük kur bülteni herkese açıktır; **kimlik bilgisi, anahtar veya
sözleşme gerektirmez.** `TCMB_BASE_URL` boş bırakılır ve istemci
(`src/lib/fx/tcmb.ts`) gerçek arşivi okur; bu değişken yalnız testin canlı
bankaya çıkmaması içindir, başka bir kur kaynağı takmak için değildir.

Operatörün bilmesi gereken tek davranış: **TCMB okunamazsa fatura kesilmez.**
Ödeme akışı kırılmaz, ödeme kaydı olduğu gibi kalır; `SystemAlert`
(`source: invoice_not_issued`, `meta.reason: fx_rate_unavailable`) hangi para
biriminde ve neden kesilemediğini yazar. TCMB döndüğünde aynı ödeme yeniden
işlendiğinde fatura kesilir — `Invoice.paymentRef` benzersiz olduğu için ikinci
bir belge oluşmaz. **Son bilinen kur bilerek kullanılmaz:** mali bir belgeye
"yeterince yakın" bir kur yazmak, uydurma rakam yazmaktır (ADR-0002, KARAR §4).

Hafta sonu ve resmî tatilde TCMB bülten yayımlamaz; yürürlükteki kur en son
yayımlanan bültenin kurudur ve istemci ona kayar. Faturada hangi günün kurunun
kullanıldığı `fxRateDate` alanında görünür — bu, bir hata değil beklenen
davranıştır.

## İlgili dosyalar

- `src/lib/env.ts` — değişken şeması (hepsi opsiyonel; eksik değişken uygulamayı düşürmez)
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — satıcı kimliği çözümü, eksikse `SupplierNotConfiguredError`
- `src/lib/efatura-integrator.ts` — entegratör arayüzü ve hata yolları
- `src/lib/efatura.ts` — UBL-TR XML ve yazdırılabilir belge; zarf numarası yoksa "mali değeri yoktur" damgası
- `src/lib/billing/vat-rate.ts` — KDV oranı kuralının tek kaynağı (alıcının ülkesi → oran); hem fatura yazıcısı hem preflight bunu çağırır
- `src/lib/billing/vat-rates.ts` — ülke tablosu: oran + kaynak + yürürlük tarihi + rejim; oran **buradan** değişir, ortam değişkeninden değil
- `src/lib/fx/tcmb.ts` — TCMB günlük bülteni; alış kuru, hafta sonu/tatil kayması, kesintide geriye kaymama kuralı (ADR-0002)
- `scripts/efatura-preflight.ts` — ön denetim komutu (`pnpm efatura:preflight`); 12 değişken, 3 blok
- `tests/efatura-unit.test.ts`, `tests/efatura-integrator.test.ts`, `tests/invoice-document.test.ts` — entegrasyon testleri
- `tests/efatura-foreign-currency.test.ts` — yabancı para birimi kuralları (belge kendi para birimini yazar; TRY dışı belge gönderilemez)
- `tests/invoice-fx-tcmb.test.ts` — TCMB istemcisi + fatura yazıcısının kur adımı (kesinti fatura kesmeyi durdurur, eski kur kullanılmaz)
- `tests/e2e/invoice-foreign-currency-export.spec.ts` — aynı kuralın gerçek rota + tarayıcı üzerinden doğrulaması (`INVOICE_SUPPLIER_*` dolu bir sunucu ve boş bir `E2E_PORT` ister)

## Go-live günü (12-13 Eylül Hafta Sonu Adım Adım Kontrol Listesi)

Patron veya operatör tarafından sırayla takip edilecek adımlar:

### ⚠️ Adım 0: Entegratörden BU cevapları da alın (yoksa Pazartesi ikinci tur gerekir)

12 değişkeni doldurmak **gönderim için yetmez**: `ADAPTERS`
(`src/lib/efatura-integrator.ts`) bugün yalnız `sandbox` içeriyor — seçilen
satıcıya özel adaptör henüz YAZILMADI, o yüzden kimlik bilgileri tam olsa bile
sonuç `provider_unsupported` döner ("gönderildi" ASLA denmez). Adaptörün
Pazartesi tek turda yazılabilmesi için görüşmede şunlar da istenmeli:

- **API dokümanı** (fatura gönderme + durum sorgulama uçları) ve **protokol**: REST/JSON mi, SOAP/WSDL mi?
- **Kimlik doğrulama biçimi**: kullanıcı+parola mı, token mı, mTLS/istemci sertifikası mı?
- **Zarf numarası** (`gibEnvelopeId`) hangi alanda dönüyor? — bir belgenin "GİB'e gönderildi" sayılmasının tek ölçütü budur.
- **Test ortamı**: ayrı base URL + ayrı test hesabı verilecek mi? (canlıya çıkmadan denemek şart)
- **UBL-TR sürümü**: 1.2.1 kabul ediliyor mu; satıcı kendi zarfına mı sarıyor?
- **Mali mühür/e-imza** kimde: entegratörde mi, bizde mi?
- **Hata/durum kodları listesi** ve tekrar gönderim (idempotency) kuralı.
- **Yabancı para birimi**: `PricingExchangeRate` / `TaxExchangeRate` bloklarını kabul ediyor mu? (ADR-0002 Seçenek b gereği USD fatura kesilecek)

### Adım 1: 12 Değişkeni Ortam Yöneticisine (Secrets/Vercel/.env) Girin
- `INVOICE_SUPPLIER_*` (5 adet zorunlu: unvan, VKN, vergi dairesi, adres, il).
- **KDV için girilecek değişken YOKTUR.** Oran alıcının ülkesinden gelir
  (`src/lib/billing/vat-rates.ts`; patron kararı 2026-09-08). `INVOICE_VAT_RATE`
  2026-09-09'da koddan tamamen **kaldırıldı** (TASK-MTTTMECDO7RC8) — bir ortam
  yöneticisinde hâlâ duruyorsa silinebilir, hiçbir şeye etkisi yoktur.
- `EFATURA_INTEGRATOR_*` (4 adet zorunlu: provider, API adresi, kullanıcı adı, parola).
- İlk aşamada test ortamında `EFATURA_INTEGRATOR_TEST_MODE=true` bırakılır.

### Adım 2: Preflight Kontrolünü Çalıştırın

**Tek komutla duman testi (Adım 2 + 3 birlikte):**
```bash
pnpm efatura:preflight && pnpm test tests/efatura-unit.test.ts tests/efatura-integrator.test.ts tests/invoice-document.test.ts
```
`&&` yüzünden ikinci komut yalnız preflight `0` ile çıkarsa çalışır — kapı kırmızıyken
testler hiç koşmaz, bu istenen davranıştır. Başarılı sonuç: preflight tablosunda üç
blok da `✅ TANIMLI`, ardından `Test Files  3 passed (3)`. Başarısız olursa aşağıdaki
Adım 2/3 alt maddelerine bakıp hangi bloğun veya testin kırmızı olduğunu bulun.

```bash
pnpm efatura:preflight
```
- **Beklenen Çıktı:**
  - Satıcı Kimliği Bloğu: `✅ TANIMLI`
  - Vergi (KDV) Bloğu: `✅ TANIMLI`
  - Entegratör Bloğu: `✅ TANIMLI`
  - Sonuç Hükmü: `📌 Fatura kaydı oluşturulur. Fatura belgesi üretilir. GİB'e gönderilir.`
  - Çıkış kodu `0`. Komut `1` ile çıkıyorsa kapı kırmızıdır.
- 🛑 **Hangi durumda DURULUR:** Herhangi bir zorunlu değişken `EKSİK` ya da `GEÇERSİZ`
  olarak listelenirse veya sonuç cümlesinde `oluşturulmaz` / `üretilmez` / `gönderilmez`
  yazıyorsa **DURULUR**. Eksik değişken giderilmeden bir sonraki adıma geçilmez.
- ℹ️ **Üç blok, üç ayrı durak.** Alıcının ülkesi için `vat-rates.ts` içinde kaynaklı
  bir satır yoksa `createInvoiceForPayment` hiç satır yazmaz
  (`SystemAlert: invoice_vat_country_unknown`); ödeme yine de tamamlanır. Satıcı kimliği
  eksikse satır yazılır ama belge (UBL-TR/PDF) üretilemez. İkisi aynı şey değildir;
  preflight hangisinde durduğunu cümleyle söyler. Preflight, KDV oranını fatura
  yazıcısıyla **aynı** kuraldan geçirir (`src/lib/billing/vat-rate.ts`), bu yüzden
  burada yeşil olan bir oranı yazıcı reddedemez. Bu blok **hiçbir ortam değişkeni
  okumaz**: düzeltme bir değişken doldurmak değil, tabloya kaynaklı satır eklemektir.

### Adım 3: Otomatik Testleri Koşturun
```bash
pnpm test tests/efatura-unit.test.ts tests/efatura-integrator.test.ts tests/invoice-document.test.ts
```
- **Beklenen Çıktı:** Tüm testlerin yeşil (`PASSED`) olması (43/43 test — 2026-09-10'da doğrulandı; sayı zamanla artabilir, önemli olan `FAILED` olmaması).
- 🛑 **Hangi durumda DURULUR:** Herhangi bir test `FAILED` verirse **DURULUR**.

### Adım 4: Örnek Fatura Belgesini Doğrulayın
- Üretilen test faturasını `/api/billing/invoices/<fatura-id>/export?format=xml` endpoint'i üzerinden indirin veya görün.
- **Beklenen Çıktı:** UBL-TR 1.2.1 uyumlu XML belgesi üretilmeli. Test modunda veya zarf numarası olmadan üretilen belgenin üzerinde `"ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur."` damgasının durduğu teyit edilmeli (`isFiledWithGib()` false dönmeli).

### Adım 5: Canlı Mod (Production) Anahtarı
- Test ortamındaki doğrulama tamamlandıktan sonra entegratör canlı API adresi ve canlı parolası girilir.
- `EFATURA_INTEGRATOR_TEST_MODE=false` yapılır.
- Tekrar `pnpm efatura:preflight` koşulup canlı mod teyit edilir.


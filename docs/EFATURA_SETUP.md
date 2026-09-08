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
`INVOICE_SUPPLIER_*` ve `INVOICE_VAT_RATE` doldurulsa bile. Ayrı kart gerekiyor.

⚠️ **`profileId` bugün varsayım.** Alıcının GİB'de e-Fatura mükellefi olup olmadığı
entegratör sorgusu ister; sözleşme yokken bilinemiyor. `EARSIVFATURA` yazılıyor ve her
kesimde `invoice_profile_assumed` uyarısı düşüyor. İlk gerçek gönderimden **önce** bu
değeri taşıyan satırlar mükellef sorgusuyla yeniden profillenmeli.

## Doldurulacak tablo

| Değişken | Nereden alınır | Örnek biçim | Zorunlu |
|---|---|---|---|
| `INVOICE_SUPPLIER_NAME` | Ticaret sicilindeki tam unvan | `Fabrika Yazılım A.Ş.` | evet |
| `INVOICE_SUPPLIER_VKN` | Vergi levhası — 10 haneli VKN | `1234567890` | evet |
| `INVOICE_SUPPLIER_TAX_OFFICE` | Vergi levhası — bağlı olunan vergi dairesi | `Doğanbey V.D.` | evet |
| `INVOICE_SUPPLIER_ADDRESS` | Sicildeki merkez adresi (sokak/no) | `Kızılırmak Mah. 1450. Cad. No:3` | evet |
| `INVOICE_SUPPLIER_CITY` | Merkez adresin ili | `Ankara` | evet |
| `INVOICE_SUPPLIER_COUNTRY` | Ülke | `Türkiye` (boşsa varsayılan) | hayır |
| `INVOICE_SUPPLIER_EMAIL` | Muhasebe e-postası (UBL-TR zorunlu kılmaz) | `muhasebe@ornek.com` | hayır |
| `INVOICE_VAT_RATE` | Aboneliğin KDV oranı (yüzde). Mali müşavire sorulur — depoda ilan edilen fiyatların KDV **dahil mi hariç mi** olduğunu söyleyen kayıt yok. Boşken **fatura kesilmez**. `0` = KDV'ye tabi değil (boş bırakmakla aynı şey değildir). | `20` | evet |
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
- **TRY dışı bir fatura bugün GİB'e GÖNDERİLMEZ.** `fileThrough` böyle bir
  belgeyi adaptöre hiç ulaştırmadan `blocked` /
  `FOREIGN_CURRENCY_NO_TL_EQUIVALENT` ile geri çevirir: yabancı para birimli
  fatura, TCMB kuru ve TL karşılığı olmadan VUK 215 / 385 Sıra No.lu Genel
  Tebliğ'e aykırıdır ve bu alanlar şemada henüz yok. Kararı bekleyen konu:
  `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`. **Canlı fiyat kataloğu
  USD olduğu için bu, kenar durum değil varsayılan yoldur** — go-live'da TL
  dışı abonelikler faturalandırılacaksa ADR-0002 önce karara bağlanmalıdır.
  Belge *üretimi* (export) etkilenmez: zarf numarası olmayan belge zaten "mali
  değeri yoktur" damgası taşır (TASK-MTSWLWDONWA3W).

## İlgili dosyalar

- `src/lib/env.ts` — değişken şeması (hepsi opsiyonel; eksik değişken uygulamayı düşürmez)
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — satıcı kimliği çözümü, eksikse `SupplierNotConfiguredError`
- `src/lib/efatura-integrator.ts` — entegratör arayüzü ve hata yolları
- `src/lib/efatura.ts` — UBL-TR XML ve yazdırılabilir belge; zarf numarası yoksa "mali değeri yoktur" damgası
- `src/lib/billing/vat-rate.ts` — `INVOICE_VAT_RATE` kabul kuralının tek kaynağı; hem fatura yazıcısı hem preflight bunu çağırır
- `scripts/efatura-preflight.ts` — ön denetim komutu (`pnpm efatura:preflight`); 13 değişken, 3 blok
- `tests/efatura-unit.test.ts`, `tests/efatura-integrator.test.ts`, `tests/invoice-document.test.ts` — entegrasyon testleri
- `tests/efatura-foreign-currency.test.ts` — yabancı para birimi kuralları (belge kendi para birimini yazar; TRY dışı belge gönderilemez)
- `tests/e2e/invoice-foreign-currency-export.spec.ts` — aynı kuralın gerçek rota + tarayıcı üzerinden doğrulaması (`INVOICE_SUPPLIER_*` dolu bir sunucu ve boş bir `E2E_PORT` ister)

## Go-live günü (12-13 Eylül Hafta Sonu Adım Adım Kontrol Listesi)

Patron veya operatör tarafından sırayla takip edilecek adımlar:

### Adım 1: 13 Değişkeni Ortam Yöneticisine (Secrets/Vercel/.env) Girin
- `INVOICE_SUPPLIER_*` (5 adet zorunlu: unvan, VKN, vergi dairesi, adres, il).
- `INVOICE_VAT_RATE` (zorunlu — mali müşavirden alınır; boşken hiç fatura kesilmez).
- `EFATURA_INTEGRATOR_*` (4 adet zorunlu: provider, API adresi, kullanıcı adı, parola).
- İlk aşamada test ortamında `EFATURA_INTEGRATOR_TEST_MODE=true` bırakılır.

### Adım 2: Preflight Kontrolünü Çalıştırın
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
- ℹ️ **Üç blok, üç ayrı durak.** `INVOICE_VAT_RATE` boş ya da 0-100 dışındaysa
  `createInvoiceForPayment` hiç satır yazmaz (`SystemAlert: vat_rate_not_configured`);
  ödeme yine de tamamlanır. Satıcı kimliği eksikse satır yazılır ama belge (UBL-TR/PDF)
  üretilemez. İkisi aynı şey değildir; preflight hangisinde durduğunu cümleyle söyler.
  Preflight, KDV oranını fatura yazıcısıyla **aynı** kuraldan geçirir
  (`src/lib/billing/vat-rate.ts`), bu yüzden burada yeşil olan bir değeri yazıcı reddedemez.

### Adım 3: Otomatik Testleri Koşturun
```bash
pnpm test tests/efatura-unit.test.ts tests/efatura-integrator.test.ts
```
- **Beklenen Çıktı:** Tüm testlerin yeşil (`PASSED`) olması (33/33 test).
- 🛑 **Hangi durumda DURULUR:** Herhangi bir test `FAILED` verirse **DURULUR**.

### Adım 4: Örnek Fatura Belgesini Doğrulayın
- Üretilen test faturasını `/api/billing/invoices/<fatura-id>/export?format=xml` endpoint'i üzerinden indirin veya görün.
- **Beklenen Çıktı:** UBL-TR 1.2.1 uyumlu XML belgesi üretilmeli. Test modunda veya zarf numarası olmadan üretilen belgenin üzerinde `"ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur."` damgasının durduğu teyit edilmeli (`isFiledWithGib()` false dönmeli).

### Adım 5: Canlı Mod (Production) Anahtarı
- Test ortamındaki doğrulama tamamlandıktan sonra entegratör canlı API adresi ve canlı parolası girilir.
- `EFATURA_INTEGRATOR_TEST_MODE=false` yapılır.
- Tekrar `pnpm efatura:preflight` koşulup canlı mod teyit edilir.


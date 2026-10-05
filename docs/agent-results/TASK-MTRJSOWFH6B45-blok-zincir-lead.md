# TASK-MTRJSOWFH6B45 — e-Fatura go-live: kartın premisi ölçüldü, asıl bloklayıcı başka çıktı

**Ajan:** blok-zincir-lead (LEED-EN, Takım Lideri) · **Tip:** runtime / dış bağımlılık · **Sprint:** SPRINT-S12
**Tarih:** 2026-09-08 · **Dal:** `dev` @ `aa11d85` · **Bkz:** `docs/EFATURA_SETUP.md`, `docs/agent-results/TASK-MTSJS1K0LTDQP-*.md`

---

## 0. Tek cümle

Kartın "kod tarafı hazır, bekleyen tek şey entegratör sözleşmesi" premisi **kısmen yanlış**:
entegratör adaptörü gerçekten bloke (o kısım doğru), ama **ödeme alındığında `Invoice` satırı
hiç yazılmıyor** — yani 14 Eylül'de kimlik bilgileri girildiğinde GİB'e gönderilecek belge
bulunmayacak. Bu, sözleşmeden bağımsız ve bugün yapılabilir.

## 1. Ne yapıldı

Kart "şimdi yap" diye gönderildi; bekleyen şey ticari sözleşme olduğu için **kod yazmadım**,
kartın premisini ölçtüm ve go-live'ı gerçekten bloklayan neyse onu açtım.

1. Bugünkü yapılandırma durumu `pnpm efatura:preflight` ile ölçüldü (§2.1).
2. "Kod tarafı hazır" iddiası dosya dosya doğrulandı — **doğru** (§2.2).
3. Fatura **yazma** yolu arandı — **yok** (§2.3). P0 kart açıldı ve delege edildi.
4. Yabancı para faturasında TCMB kuru alanı arandı — **yok** (§2.4). Kart açıldı, sıraya alındı.
5. Hafta sonu görüşmesinden dönmesi gereken girdi listesi çıkarıldı (§4) — kimlik bilgisi
   tek başına yetmiyor.

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Preflight — bugünkü gerçek durum, 12 değişkenin 12'si boş

```
1. Satıcı Kimliği Bloğu : ❌ EKSİK (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN,
   INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY)
2. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL,
   EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

📌 Fatura belgesi üretilmez. GİB'e gönderilmez, sebep: ... eksik.
[ELIFECYCLE] Command failed with exit code 1.
```
Preflight doğru çalışıyor: eksikleri adıyla sayıyor ve **sıfır dışı** çıkıyor.

### 2.2 "Kod tarafı hazır" — DOĞRULANDI

| Parça | Durum |
|---|---|
| `src/lib/env.ts` — 12 değişkenin opsiyonel şeması | var |
| `src/lib/efatura-integrator.ts` — dikiş, `FilingOutcome`, `ADAPTERS` kayıt defteri | var |
| `createSandboxAdapter` — canlı modda seçilirse hata fırlatıyor | var |
| `resolveIntegrator` — kayıtsız sağlayıcıda `provider_unsupported` | var |
| `fileThrough` — adaptörün fırlattığı her şeyi `unreachable`'a çeviriyor | var |
| `isFiled()` — yalnız zarf numarası varsa true | var |
| `scripts/efatura-preflight.ts` (`pnpm efatura:preflight`) | var |
| `docs/EFATURA_SETUP.md` — doldurulacak tablo + go-live adımları | var |
| e-Arşiv / ihracat modellemesi (`profileId`, `invoiceType`, `buyerCountry`) | şemada var |

Tasarım sağlam: `file()` zarf numarası olmadan `filed` dönemiyor, yani "gönderildi" yalanı
mekanik olarak imkânsız.

### 2.3 ASIL BLOKLAYICI — hiçbir üretim kodu `Invoice` satırı yazmıyor

```
$ grep -rniE "invoice\.(create|upsert|createMany)|INSERT INTO \"?Invoice" src scripts prisma tests workers
tests/e2e/invoice-export-real-record.spec.ts:81:      prisma.invoice.create({
tests/e2e/billing-invoice-history.spec.ts:90:    await prisma.invoice.create({
```
Tek yazan yer **iki e2e testi**. Üretim kodunda sıfır. Ödeme yolları yalnız `AuditEvent` yazıyor:

```
$ grep -rniE "invoice" src/lib/iyzico.ts src/lib/billing/subscription-sync.ts
src/lib/iyzico.ts:713: // Invoice record. There is no Invoice table; the Stripe path records paid
src/lib/iyzico.ts:714: // invoices as audit events and this follows it, so tenant billing history
src/lib/iyzico.ts:719:         type: 'invoice.payment_succeeded',
src/lib/billing/subscription-sync.ts:559: export async function logInvoicePayment(
```
`iyzico.ts:713`'teki "There is no Invoice table" yorumu **bayat** — tablo TASK-MTRD9QBJ2G32E
ile eklendi, yorum ve kod güncellenmemiş.

**Sonuç:** ödeme yapmış müşterinin faturası yok; export rotası her zaman 404; 14 Eylül'de
env'ler dolsa bile gönderilecek belge yok.

### 2.4 Yabancı para faturasında kur alanı yok

```
$ grep -rniE "exchangeRate|PricingExchangeRate|TCMB" src prisma docs
(çıktı yok)

src/lib/efatura.ts:37:   currency: 'TRY' | 'EUR' | 'USD';
src/lib/efatura.ts:213:  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
```
Planlar USD fiyatlı (BILLING.md). UBL-TR'de döviz faturası TL karşılığı + kur ister.
Ayrıca alan adları `unitPriceTRY` / `subtotalTRY` ama içine `currency` ne ise o yazılıyor —
isimlendirme yanıltıcı.

## 3. Değişen dosyalar

Kod değişikliği **yok** (kasıtlı — bekleyen şey iş gücü değil, ticari sözleşme). Board'da:

| Kayıt | İşlem |
|---|---|
| `TASK-MTSWL8ADKZKDM` | AÇILDI (P0) + geli-tirici'ye delege edildi — Invoice yazma yolu |
| `TASK-MTSWLWDONWA3W` | AÇILDI (backlog) — TCMB kuru / döviz faturası, P0'dan sonra |
| `TASK-MTRJSOWFH6B45` | backlog'da KALIYOR — 14 Eylül'e kadar kimseye atanmaz (kartın kendi kararı doğru) |

## 4. Riskler

- **En büyük risk hafta sonunda:** entegratörden yalnız kullanıcı adı + parola alınırsa
  Pazartesi adaptör yine yazılamaz. Gereken girdi listesi §6'da.
- `profileId` (e-Fatura mi e-Arşiv mi) alıcının GİB mükellefi olup olmadığına bağlı; bu sorgu
  entegratör API'siyle yapılır. Bugün varsayılanla yazılacak, 14 Eylül'de gerçek sorguya bağlanmalı.
- Ödeme almış müşteriler için **geçmişe dönük fatura** gerekebilir; bu bir muhasebe kararıdır,
  mühendislik kararı değil.

## 5. Açık sorular

1. Alıcı VKN/vergi dairesi/adresi bugün hiçbir yerde toplanmıyor. Kiracı bu bilgiyi nereden ve
   ne zaman verecek (kayıt sırasında mı, ilk ödemede mi)? **Ürün kararı.**
2. Şimdiye kadar alınmış ödemeler için geriye dönük fatura kesilecek mi? **Muhasebe kararı.**
3. Döviz faturası mı, TL'ye çevirip TL fatura mı? (TASK-MTSWLWDONWA3W'nin ADR'si bunu soracak.)

## 6. Sonraki adım — hafta sonu görüşmesinden DÖNMESİ GEREKEN girdiler

Kimlik bilgisi tek başına Pazartesi'yi kurtarmaz. Entegratörden şunlar istenmeli:

1. **API dokümantasyonu** (endpoint listesi, kimlik doğrulama şeması, örnek istek/yanıt).
2. **Test ortamı hesabı** — canlıdan ayrı `baseUrl` + kullanıcı. İlk hafta canlıya gönderim yok.
3. **Zarf numarası (`gibEnvelopeId`) hangi alanda dönüyor** ve durum sorgusu nasıl yapılıyor.
4. **e-Arşiv desteği ve mükellef sorgu servisi** — alıcının e-Fatura mükellefi olup olmadığını
   VKN'den sorgulayan uç nokta. Bu olmadan `TICARIFATURA`/`EARSIVFATURA` seçimi yapılamaz.
5. **Döviz faturası** kabul ediyorlar mı, TL karşılığını kim hesaplıyor (bkz. §2.4).
6. **Hata kodları listesi** — hangi kod "reddedildi", hangisi "tekrar dene".
7. Sözleşmede **test → canlı geçiş** adımı ve varsa onay süresi.

**Kartın durumu:** `backlog`'da kalır, 14 Eylül Pazartesi açılır. O tarihe kadar ekip
TASK-MTSWL8ADKZKDM üzerinden go-live'ın gerçekten bloke olan kısmını kapatıyor.

# TASK-MTSWLWDONWA3W — Yabancı para faturada TCMB kuru alanı yok (QA turu)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Tip:** bug + regresyon koruması
**Kanıt klasörü:** `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/`
**Önceki tur:** `TASK-MTSWLWDONWA3W-blockzincir-pm.md` (ölçüm + ADR-0002, kod yazılmadı)

## 1. Ne yapıldı

Kartın iddiası (kur/TL karşılığı alanı yok) **doğrulandı ve hâlâ geçerli**.
Ama iddia grep seviyesinde ölçülmüştü; ben USD faturayı **gerçek üretim
yolundan geçirip çıktıya baktım** ve kartta olmayan, daha ağır ikinci bir
kusur buldum.

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| F-1 | Yazdırılabilir/PDF fatura görünümü **USD tutarları `₺` ile basıyordu** — belge "Para Birimi: USD" derken tutarları lira olarak gösteriyor. `$99,00` → `₺99,00`. | **P0 / SEV-1** — belge kendi içinde çelişiyor, tutarı günün kuru kadar (~40×) eksik gösteriyor, bugün canlı bir rotadan erişilebiliyor | **DÜZELTİLDİ + regresyon testi** |
| F-2 | UBL-TR XML'i TL karşılığı ve TCMB kuru taşımıyor (kartın kendi iddiası) | **P0 / uyum** — VUK 215 / 385 | **KAPATILMADI** (ADR-0002 kararı bekliyor) — ama artık **gönderim kapısıyla bloke** |
| F-3 | `unitPriceTRY` / `subtotalTRY` … alan adları para biriminden bağımsız değer taşıyordu; `calculateInvoiceTotals` her faturayı TRY minor unit'inde yuvarlıyordu | P2 — F-1'in kök nedeni | **DÜZELTİLDİ** |

F-2 için kod yazmadım: hangi alanların ekleneceği, kurun hangi TCMB serisinden
ve hangi tarihten alınacağı ADR-0002'de **karara bağlanmamış** durumda ve
kartın kendi kuralı Faz 2'yi TASK-MTSWL8ADKZKDM'ye bağlıyor. Uydurulmuş bir kur
mali bir belgede uydurulmuş bir rakam olurdu. Bunun yerine **karardan bağımsız**
olan tek şeyi yaptım: TL karşılığı taşımayan yabancı para faturasının GİB'e
**gönderilmesini** engelleyen bir kapı. Üç seçenek (a/b/c) de bu noktada
hemfikir; karar çıkınca kapı tek yerden gevşetilir.

### Değişen davranış

1. **Belge kendi para birimini yazar.** `generateEfaturaHtml` artık tutarları
   `Intl.NumberFormat('tr-TR', { style: 'currency', currency })` ile basıyor.
   TRY çıktısı **birebir aynı** (`₺99,00`) — regresyon riski yok; USD `$99,00`,
   EUR `€99,00`.
2. **Toplamlar faturanın kendi para biriminde yuvarlanıyor.**
   `calculateInvoiceTotals(lines, currency)`.
3. **`FilingOutcome`'a `blocked` eklendi.** `fileThrough`, TRY olmayan bir
   belgeyi **adaptöre hiç ulaştırmadan** `blocked` /
   `FOREIGN_CURRENCY_NO_TL_EQUIVALENT` ile geri çeviriyor. `rejected`'tan ayrı
   tutuldu: bu süreçten hiçbir şey çıkmadı, entegratör belgeyi görmedi.
   Belge **üretimi (export) etkilenmedi** — müşteri makbuzunu almaya devam
   ediyor, zarf numarası olmayan belge zaten "mali değeri yoktur" damgalı.

## 2. Kanıt

### 2.1 ÖNCESİ — gerçek tarayıcı, gerçek HTTP rotası

`docs/agent-results/TASK-MTSWLWDONWA3W-evidence/00-BEFORE-browser-usd-shows-lira.png`
— "Para Birimi: **USD**" yazan belgede `₺99,00`, `₺19,80`, `ÖDENECEK GENEL
TOPLAM: ₺118,80`.

### 2.2 ÖNCESİ — üretim yolundan üretilmiş çıktı

`01-RED-before-fix.txt` (yeni testlerin kırmızı koşusu):

```
 ❯ tests/efatura-foreign-currency.test.ts (7 tests | 5 failed)
     × the printable document never prints ₺ on an amount that is not TRY
     × the document that reaches the renderer carries the amount under a currency-neutral name
     × totals are rounded in the invoice currency, not always in kuruş
     × the block is named, so a caller can report which figures are missing
     × filing a USD document is refused before the adapter is ever reached
```

Aynı turda ölçülen ham çıktı (`buildInvoiceDocument` → `generateEfaturaHtml`,
9900 minor unit USD satır):

```
=== HTML (customer-facing PDF view): every money cell ===
<strong>Para Birimi:</strong> USD
...>₺99,00</td>
...>₺19,80</td>
...>₺118,80</td>
=== XML: does it carry a TL equivalent or a rate? ===
PricingExchangeRate: false
TaxExchangeRate   : false
any "TRY" anywhere : false
```

### 2.3 SONRASI — gerçek DB gidiş-dönüşü + gerçek tarayıcı

`03-GREEN-live-db-roundtrip.txt` — gerçek Postgres'e USD ve TRY satırı yazıldı,
`withTenantOn` (RLS kiracı bağlamı) ile geri okundu, üretim belge kurucusu ve
üreticisinden geçirildi, sonra satırlar silindi:

```
rows read back through withTenantOn (RLS tenant context set): 2

=== TRY (row qa-fx-...-TRY) ===
  header says      : TRY
  money cells      : ₺99,00  ₺99,00  ₺99,00  ₺19,80  ₺118,80
  xml currencies   : TRY
  filing block     : (none — may be filed)
  fileThrough      : filed | adapter reached: true

=== USD (row qa-fx-...-USD) ===
  header says      : USD
  money cells      : $99,00  $99,00  $99,00  $19,80  $118,80
  lira sign in doc : false
  xml currencies   : USD
  xml has TL rate  : false
  filing block     : USD faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e
                     gonderilemez (VUK 215 / 385 Sira No.lu Genel Teblig).
                     Karar bekliyor: docs/adr/ADR-0002-foreign-currency-invoice-fx.md
  fileThrough      : blocked | adapter reached: false

cleanup: tenant and invoices deleted
```

`04-GREEN-browser-render.txt` + `04-browser-USD-invoice.png` +
`05-browser-TRY-invoice.png` — aynı iki belge gerçek Chromium'da açıldı:

```
=== USD — as a browser renders it ===
Para Birimi: USD
1	Fabrika Pro (1 ay)	1 Adet	$99,00	%20	$99,00
ÖDENECEK GENEL TOPLAM:	$118,80
  lira sign visible: false · dollar sign visible: true

=== TRY — as a browser renders it ===
Para Birimi: TRY
1	Fabrika Pro (1 ay)	1 Adet	₺99,00	%20	₺99,00
ÖDENECEK GENEL TOPLAM:	₺118,80
  lira sign visible: true · dollar sign visible: false
```

### 2.4 Kapı (gate)

```
$ npx tsc --noEmit          → tsc exit=0
$ npx eslint .              → eslint exit=0
$ npx vitest run            → Test Files 119 passed | 2 skipped (121)
                              Tests 1356 passed | 8 skipped (1364)   exit=0
$ npx tsx scripts/i18n-check.ts
  ✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

Yeni testlerin süitte olduğu ayrıca doğrulandı (`npx vitest list` → 7 satır,
toplam 1356 = koşan test sayısı).

### 2.5 Regresyon — mevcut e2e, canlı sunucuya karşı

```
$ E2E_PORT=3000 npx playwright test tests/e2e/invoice-export-real-record.spec.ts \
                                    tests/e2e/invoice-foreign-currency-export.spec.ts
  ✓ an anonymous caller gets no document at all
  ✓ an id that exists nowhere is 404, not an invented invoice
  ✓ another tenant's invoice is 404 — the same answer as one that does not exist
  ✓ an unsupported format is refused before anything is read
  ✓ the tenant's own invoice renders that row, and nothing invented
  3 skipped
  5 passed (1.2s)                                                    EXIT: 0
```

**3 skipped = benim yeni e2e spec'im**, ve bunu "geçti" diye sunmuyorum: bu
makinedeki çalışan dev sunucusunda `INVOICE_SUPPLIER_*` boş, o yüzden rota 503
veriyor ve render dalına hiç girilmiyor. Spec o dalda da **iddia ediyor**
(`supplier_identity_not_configured` + `INVOICE_SUPPLIER_VKN`), yani boşa yeşile
dönmüyor; skip mesajı eksik olanın adını söylüyor. Render dalının kanıtı §2.3'te
(gerçek DB + gerçek tarayıcı).

## 3. Yol üstünde bulunan bir tuzak (kayda geçiyorum)

İlk e2e denemem **yanlış kırmızı** verdi: Playwright `reuseExistingServer: true`
ile seçtiğim `E2E_PORT=3123`'te **başka bir ajanın 20:08'de başlattığı
`next start` (üretim derlemesi)** çalışıyordu; testim benim ağacımı değil, o
derlemeyi ölçtü. Kanıt:

```
$ ps aux | grep next
macbook 47914 ... npm exec next start --port 3123
   (env: INVOICE_SUPPLIER_NAME="TEST TEDARIKCI - GERCEK SIRKET DEGIL" ...)
$ lsof -nP -iTCP:3123 -sTCP:LISTEN → node 47923 (LISTEN)
```

Boş bir port denedim, bu sefer Next 16 ikinci bir `next dev`'i reddetti
(`Another next dev server is already running` — PID 66241, :3000). Bu yüzden
render dalının kanıtı HTTP yerine gerçek DB + gerçek tarayıcı üzerinden alındı;
sınırı §2.5'te açıkça yazdım.

## 4. Değişen dosyalar

**Kod:**
- `src/lib/efatura.ts` — para birimine duyarlı tutar basımı (`formatInvoiceAmount`),
  `calculateInvoiceTotals(lines, currency)`, `foreignCurrencyFilingBlock`,
  `unitPriceTRY`/`*TRY` alan adları para biriminden bağımsız adlara
- `src/lib/efatura-integrator.ts` — `FilingOutcome`'a `blocked`,
  `FOREIGN_CURRENCY_FILING_BLOCK`, `fileThrough` içinde kapı
- `src/lib/adapters/efatura.ts` — yeni sabitin yeniden dışa aktarımı
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — alan adı

**Test:**
- `tests/efatura-foreign-currency.test.ts` (yeni, 7 test)
- `tests/e2e/invoice-foreign-currency-export.spec.ts` (yeni, 3 test)
- `tests/efatura.test.ts`, `tests/efatura-unit.test.ts`,
  `tests/invoice-document.test.ts`, `tests/efatura-integrator.test.ts` — alan adı

**Doküman:**
- `docs/EFATURA_SETUP.md` — "TRY dışı fatura bugün gönderilmez" maddesi + yeni testler
- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` — "Ara önlem" bölümü eklendi
  (karar hâlâ bekliyor; ADR'nin kararı **değiştirilmedi**)

**DOKUNULMADI** (başka kartların sahipliğinde): `prisma/schema.prisma`,
`prisma/migrations/*`, `src/lib/billing/invoice-writer.ts`.

## 5. Riskler

- **Gönderim kapısı bir go-live blokerıdır.** Canlı fiyat kataloğu USD olduğu
  için, ADR-0002 kararı gelmeden GİB env'leri girilirse **hiçbir abonelik
  faturası GİB'e gönderilemeyecek** (`blocked`). Bu bilerek seçildi — sessizce
  usulsüz fatura kesmekten iyidir — ama patron/lider bunu bilerek 12-13 Eylül'e
  girmeli.
- `blocked` yeni bir `FilingOutcome` varyantı. Bugün hiçbir yerde tüketilmiyor
  (gönderim çağıran bir üretim yolu henüz yok), o yüzden kırdığı bir dal yok;
  ileride bir çağıran yazılırsa bu varyantı ele almalı.
- Alan adı değişimi 6 dosyada mekanikti, typecheck + 1356 test yeşil; yine de
  bu isimleri kullanan **commit edilmemiş** bir başka ajan çalışması varsa
  (ör. sürmekte olan `invoice-writer` kartı) birleştirmede çakışabilir —
  `invoice-writer.ts` bu adları kullanmıyor, kontrol edildi.

## 6. Açık sorular

- **ADR-0002 kararı hâlâ verilmedi.** (b) mi (c) mi, TCMB hangi seri/tarih,
  hafta sonu kuralı ne? Bunlar muhasebe kararı; ADR'de listeli.
- UBL-TR `PricingExchangeRate` / `TaxExchangeRate` alan adları hâlâ ikincil
  kaynaktan; GİB'in birincil kılavuzundan teyit edilmedi (PM raporu §2.3).
- Yeni e2e spec'inin render dalı bu makinede koşulamadı (yukarıda). CI'da ya da
  `INVOICE_SUPPLIER_*` dolu bir ortamda **boş bir portla** koşulmalı.

## 7. Sonraki adım

1. Lider/patron **ADR-0002'yi 12 Eylül'den önce karara bağlasın** — artık karar
   vermemenin bedeli "yanlış fatura" değil, "hiç fatura gönderilememesi".
2. Karar çıkınca Faz 2 kartı açılsın (şema alanları + TCMB istemcisi + XML
   blokları); `foreignCurrencyFilingBlock` o kartta tek yerden gevşetilir ve
   `tests/efatura-foreign-currency.test.ts` o kartın regresyon ağı olur.
3. `INVOICE_SUPPLIER_*` dolu bir ortamda
   `tests/e2e/invoice-foreign-currency-export.spec.ts` boş bir portla koşulsun.

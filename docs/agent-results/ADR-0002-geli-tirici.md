# TASK-MTT13PK0Z4ZLB — ADR-0002 Faz 2: Invoice'a TCMB kuru + TL karşılığı

- **Ajan:** BE-EN (`geli-tirici`) · **Sprint:** S12 · **Branch:** `dev`
- **Karar dayanağı:** `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` — Seçenek (b), patron 2026-09-08
- **Faz 1 (yeniden yazılmadı, çağrıldı):** `c029e1c` — `EfaturaDocument.exchangeRate`,
  UBL-TR `PricingExchangeRate`/`TaxExchangeRate`, `foreignCurrencyFilingBlock`,
  `convertCurrencyMinor`

---

## 1. Ne yapıldı

### Faz B'den önce alınan karar (bloke soru)

Karta göre Faz B'ye başlamadan önce ADR-0002'nin açık bıraktığı tek soru soruldu:
**TCMB erişilemediğinde ne olacak?** Alınan cevap: **fatura kesme durur +
`SystemAlert`; son bilinen kur KULLANILMAZ.** Kod bu karara göre yazıldı; ADR'nin
"TCMB kesintisi — KARARA BAĞLANDI" bölümü de aynı yönde güncellenmiş durumda.

### (A) Şema + migration

`prisma/schema.prisma` → `Invoice` modeline dört alan:

| Alan | Tip | Anlamı |
|---|---|---|
| `fxRate` | `Decimal? @db.Decimal(18,6)` | TCMB döviz **alış** kuru, 1 `currency` → TRY |
| `fxRateDate` | `DateTime? @db.Date` | Kurun **yayımlandığı gün** — hafta sonu/tatilde `issuedAt`'ten önceki bir gün olabilir |
| `fxRateSource` | `String?` | Kaynak (`TCMB`); tahmin değil, kaynak beyanı |
| `grandTotalTryMinor` | `Int?` | TL karşılığı: ödenecek genel toplam, minor unit (kuruş) |

Migration `prisma/migrations/add-invoice-fx-rate.sql` — additive (dört nullable
kolon + bir CHECK), idempotent (`ADD COLUMN IF NOT EXISTS` + `pg_constraint` guard).
Geri alma: `prisma/migrations/add-invoice-fx-rate.down.sql`.

Değişikliğin asıl noktası CHECK kısıtı
`Invoice_fx_required_for_foreign_currency` — TRY faturada dört alan da NULL
olabilir, **TRY dışı faturada dördü de zorunludur**. Yani "kursuz döviz faturası"
uygulama katmanında caydırılan değil, **veritabanında temsil edilemeyen** bir şey.

Kısıt **`NOT VALID`** eklendi ve bu bilinçli: yerel DB'de kural konmadan önce
yazılmış bir döviz satırı ölçüldü (TASK-MTSWLWDONWA3W'den kalan `qa-fx-…-USD` QA
verisi), doğrulayan bir kısıt kurulamazdı. `NOT VALID`, bundan sonraki her
INSERT/UPDATE'te uygulanır; eski satırları silmeye/karartmaya kalkmaz. O satırlar
zaten `foreignCurrencyFilingBlock` tarafından GİB'e geçirilmiyor. Ortam temizlendiğinde
tek deyimle terfi ettirilebilir (SQL migration dosyasında yazılı).

RLS: değişiklik yok — `Invoice` zaten `tenant_isolation` listesinde, politika tablo
seviyesinde, yeni kolonlar aynı izolasyonu miras alır. `pnpm rls:check` + `pnpm rls:verify`
yeşil (aşağıda).

### (B) TCMB kur istemcisi — `src/lib/fx/tcmb.ts` (yeni)

- Kaynak: `https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml` — **kimlik bilgisi
  gerektirmez**, 14. bir go-live değişkeni değildir.
- Okunan alan `ForexBuying` (VUK 280 **alış** kuru). `ForexSelling` /
  `BanknoteBuying` bilerek okunmaz. `Unit` dikkate alınır (TCMB bazı para birimlerini
  100 birim üzerinden kotalar).
- **Hafta sonu/tatil kayması:** bülten yoksa (HTTP 404) gün gün geriye kayar, en çok
  `MAX_LOOKBACK_DAYS = 10` (en uzun Kurban Bayramı köprüsü 9 gün). **Fiilen kullanılan
  gün `fxRateDate`'e yazılır.**
- **Kesintide geriye KAYILMAZ.** Bağlantı hatası / zaman aşımı / 5xx → anında
  `unreachable`. Yalnız 404 ("o gün bülten yok") imleci taşır. Bu ayrım dosyanın tüm
  güvenlik özelliği: kesinti sırasında geriye kaymak, yasaklanan "son bilinen kur"
  davranışının aynısını meşru bir kurun kılığında üretirdi.
- Bülten kendi tarihini beyan eder (`Tarih_Date`), istenen günle karşılaştırılır —
  200 ile dönen bir hata sayfası/yönlendirme gövdesi `malformed_bulletin` olur, rakam
  uydurmaz.
- Hiç `throw` etmez; her sonuç ya TCMB'nin gerçekten yayımladığı bir kur ya da
  çağıranın `SystemAlert`'e çevirdiği bir başarısızlıktır.
- Önbellek yalnız **başarılı** bülteni **kendi yayım günüyle** anahtarlar; bu bir
  fallback değil (geçmiş bir günün bülteni değişmez), bugünün bülteni henüz
  yayımlanmamışsa tekrar sorulmaya devam eder.
- `TCMB_BASE_URL` (`src/lib/env.ts`, `.env.example`) yalnız testin canlı bankaya
  çıkmaması içindir.

### (C) Fatura yazıcısı — `src/lib/billing/invoice-writer.ts`

- Yeni saf fonksiyon `resolveInvoiceFx(amountMinor, currency, issuedAt, fetchRate)`:
  TRY → `null` (çevrilecek bir şey yok); USD/EUR → kur + TL karşılığı
  (`convertCurrencyMinor` **yeniden yazılmadı, çağrıldı**); başka para birimi →
  `fx_currency_unsupported`.
- İki yeni `skipped` sebebi: `fx_rate_unavailable`, `fx_currency_unsupported`.
- Kur **numara tahsisinden önce** çekilir; TCMB kesintisi hiçbir fatura numarasını
  yakmaz.
- Başarısızlıkta: **hiç satır yazılmaz**, `SystemAlert` (`source: invoice_not_issued`)
  para birimini ve sebebi yazar — alıcıyı, VKN'yi, tutarı **yazmaz**; ödeme etkilenmez.
- Başarıda dört alan satıra yazılır; `paymentRef` benzersizliği sayesinde TCMB
  dönünce aynı ödeme yeniden işlendiğinde ikinci belge oluşmaz.

### `EfaturaDocument.exchangeRate` artık gerçekten doluyor

`export/route.ts` dört kolonu `select` ediyor; `invoice-document.ts` içindeki yeni
`exchangeRateFromRecord()` bunları belgenin `exchangeRate` bloğuna çeviriyor
(Prisma `Decimal` → sayı, yapısal `toNumber()` ile, Prisma runtime'ı bu modüle
sokmadan). Böylece Faz 1'in UBL-TR blokları ilk kez **kayıttan beslenen** veriyle
üretiliyor ve `foreignCurrencyFilingBlock` yalnız **kaydı olmayan** belgede kalıyor.

### Dokümanlar

- `docs/DATA_MODEL.md` §11 tablosuna dört alan + yeni **§11.1** (kur nereden gelir,
  hafta sonu kayması, kesinti davranışı, `NOT VALID` gerekçesi, terfi SQL'i).
- `docs/EFATURA_SETUP.md`: "TRY dışı fatura gönderilemez" maddesi **koşullu** hale
  getirildi + "TCMB kuru — 14. bir değişken YOKTUR" bölümü (operatörün bilmesi
  gereken tek davranış: TCMB okunamazsa fatura kesilmez).
- `.env.example`: `TCMB_BASE_URL` + neden boş bırakılacağı.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Migration İKİ KEZ koştu — additive + idempotent

```
########## RUN 1 ##########
BEFORE  rows(total): { n: 2 }  rows(non-TRY): { n: 1 }
BEFORE  fx columns: []
BEFORE  check constraint: []
AFTER   rows(total): { n: 2 }  rows(non-TRY): { n: 1 }
AFTER   fx columns: [
  { column_name: 'fxRate', data_type: 'numeric', numeric_precision: 18, numeric_scale: 6 },
  { column_name: 'fxRateDate', data_type: 'date', numeric_precision: null, numeric_scale: null },
  { column_name: 'fxRateSource', data_type: 'text', numeric_precision: null, numeric_scale: null },
  { column_name: 'grandTotalTryMinor', data_type: 'integer', numeric_precision: 32, numeric_scale: 0 }
]
AFTER   check constraint: [ { conname: 'Invoice_fx_required_for_foreign_currency' } ]

########## RUN 2 (idempotency) ##########
BEFORE  rows(total): { n: 2 }  rows(non-TRY): { n: 1 }
BEFORE  fx columns: [ …aynı dört kolon… ]
BEFORE  check constraint: [ { conname: 'Invoice_fx_required_for_foreign_currency' } ]
AFTER   rows(total): { n: 2 }  rows(non-TRY): { n: 1 }
AFTER   fx columns: [ …aynı dört kolon… ]
AFTER   check constraint: [ { conname: 'Invoice_fx_required_for_foreign_currency' } ]
```

**Değişmez ölçümü:** satır sayısı 2 → 2, TRY dışı satır 1 → 1. Hiçbir mevcut satır
yazılmadı, silinmedi, değiştirilmedi.

### 2.2 Geri alma yolu — down migration da koştu, iki kez

```
##### DOWN #####
BEFORE  rows(total): { n: 2 }  ... check constraint: [ { conname: 'Invoice_fx_required_for_foreign_currency' } ]
AFTER   rows(total): { n: 2 }  ... fx columns: []   check constraint: []

##### DOWN AGAIN (idempotent) #####
BEFORE  fx columns: []   check constraint: []
AFTER   fx columns: []   check constraint: []

##### UP AGAIN (restore) #####
BEFORE  fx columns: []   check constraint: []
AFTER   fx columns: [ … ]  check constraint: [ { conname: 'Invoice_fx_required_for_foreign_currency' } ]
```

### 2.3 Kısıt gerçekten AYIRT EDİYOR (sıfır hata değil, **ret** kanıtı)

Beş INSERT denemesi, hepsi `ROLLBACK` ile geri alındı:

```
TRY invoice, no rate           : ACCEPTED
USD invoice, NO rate           : REJECTED — new row for relation "Invoice" violates check constraint "Invoice_fx_required_for_foreign_currency"
USD invoice, rate = 0          : REJECTED — new row for relation "Invoice" violates check constraint "Invoice_fx_required_for_foreign_currency"
USD invoice, rate but no TL sum: REJECTED — new row for relation "Invoice" violates check constraint "Invoice_fx_required_for_foreign_currency"
USD invoice, full FX record    : ACCEPTED
```

### 2.4 TCMB istemcisi GERÇEK bankaya karşı — URL ve ayrıştırma varsayımı doğrulandı

```
requested day : 2026-09-08
first URL     : https://www.tcmb.gov.tr/kurlar/202609/08092026.xml
USD {"ok":true,"rate":{"currency":"USD","rate":48.3727,"rateDate":"2026-09-08","source":"TCMB"}}
EUR {"ok":true,"rate":{"currency":"EUR","rate":56.18,"rateDate":"2026-09-08","source":"TCMB"}}
```

Hafta sonu kayması da **gerçek TCMB üzerinde** ölçüldü (Cts/Paz → Cuma bülteni):

```
2026-09-04 Fri → {"ok":true,"rate":{...,"rate":48.2326,"rateDate":"2026-09-04",...}}
2026-09-05 Sat → {"ok":true,"rate":{...,"rate":48.2326,"rateDate":"2026-09-04",...}}
2026-09-06 Sun → {"ok":true,"rate":{...,"rate":48.2326,"rateDate":"2026-09-04",...}}
2026-09-07 Mon → {"ok":true,"rate":{...,"rate":48.3465,"rateDate":"2026-09-07",...}}
```

### 2.5 ÇÜRÜTME SONDASI — TCMB kapalı → `blocked`, açık → geçiyor

Gerçek DB + gerçek `createInvoiceForPayment` + gerçek belge üreteci + gerçek
`fileThrough`. Her iki koşu da geri alınan bir transaction içinde
(`Invoice rows before/after` aynı).

**(a) TCMB KAPALI** (`TCMB_BASE_URL=http://127.0.0.1:1/kurlar` → gerçek ECONNREFUSED):

```
### MODE: TCMB OFF  (TCMB_BASE_URL=http://127.0.0.1:1/kurlar)
Invoice rows before: 2
createInvoiceForPayment(USD) -> {"status":"skipped","reason":"fx_rate_unavailable"}
No invoice row was written, so there is no document to file.
TL equivalent written anywhere?  none — no row exists.
A rate-less USD row at the filing gate -> {"status":"blocked","code":"FOREIGN_CURRENCY_NO_TL_EQUIVALENT","reason":"USD faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez (VUK 215 / 385 Sira No.lu Genel Teblig). Karar bekliyor: docs/adr/ADR-0002-foreign-currency-invoice-fx.md"}
reached the integrator adapter? false
(transaction rolled back — nothing persisted)
Invoice rows after: 2
```

→ Fatura kesilmedi, **sessizce TL karşılığı 0 yazılmadı** (hiç satır yok), belge
adaptöre hiç ulaşmadı.

**(b) TCMB AÇIK** (gerçek tcmb.gov.tr):

```
### MODE: TCMB ON  (TCMB_BASE_URL=<real tcmb.gov.tr>)
Invoice rows before: 2
createInvoiceForPayment(USD) -> {"status":"issued","id":"cmtt1p67v0000ckxkm0vmdz3b","number":"FB-2026-000001","ettn":"7991d1ec-fc84-462c-aa5e-69ecd131e758"}
Stored FX columns: {"currency":"USD","fxRate":"48.3727","fxRateDate":"2026-09-08","fxRateSource":"TCMB","grandTotalTryMinor":478890}
fileThrough -> {"status":"filed","envelopeId":"ENV-PROBE-1","filedAt":"2026-09-08T19:11:11.055Z"}  (filed=true, reached adapter=true)
UBL-TR PricingExchangeRate block:
<cac:PricingExchangeRate>
    <cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>48.3727</cbc:CalculationRate>
    <cbc:Date>2026-09-08</cbc:Date>
  </cac:PricingExchangeRate>
(transaction rolled back — nothing persisted)
Invoice rows after: 2
```

Aritmetik kontrolü: $99,00 × 48,3727 = 4.788,89730 TL → **478890** kuruş (half-up). ✔

Sonda betikleri: `docs/agent-results/ADR-0002-evidence/probe-fx-e2e.mts`,
`probe-constraint.mts`, `apply-fx-migration.mts`.

### 2.6 Birim testler — 21 yeni test

`tests/invoice-fx-tcmb.test.ts`: bülten ayrıştırma (alış kuru, `Unit`, tarih beyanı,
makul görünen hata sayfası), gün seçimi (hafta sonu kayması + çağrı sırası),
**kesinti geriye kaymaz (tam 1 deneme)**, 5xx = kesinti, tarih uyuşmazlığı,
`resolveInvoiceFx` aritmetiği, ve yazıcı düzeyinde: USD → dört alan yazılır,
TRY → dördü NULL, kesinti → `create` **hiç çağrılmaz** + alert alıcı kimliğini
sızdırmaz.

### 2.7 E2E — gerçek HTTP + gerçek tarayıcı

```
Running 5 tests using 1 worker
  ✓  1 … › the USD document never prints a lira sign, and the TRY one still does (689ms)
  ✓  2 … › the XML declares one currency and uses it on every amount (16ms)
  ✓  3 … › the XML carries the TCMB rate the row was issued at (28ms)
  ✓  4 … › the database itself refuses a foreign-currency invoice with no rate (49ms)
  ✓  5 … › the printable page a customer sees agrees with itself (227ms)

  5 passed (6.2s)
```

Ekran görüntüleri: `docs/agent-results/ADR-0002-evidence/01-usd-invoice-html.png`,
`02-try-invoice-html.png`.

### 2.8 Kapı

```
### pnpm typecheck
$ tsc --noEmit

### pnpm lint
$ eslint
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used
✖ 2 problems (0 errors, 2 warnings)        ← ikisi de başka bir kartın kanıt dosyasından, benim değişikliğimden değil

### pnpm test
 Test Files  125 passed | 2 skipped (127)
      Tests  1481 passed | 8 skipped (1489)
```

`pnpm gate` tamamı da yeşil koştu (`i18n:check` ✅, `rls:check` 43/43 ✅,
`rls:verify` `fabrika_app` rolüyle gerçekten ölçüldü ✅). `catalog.test.ts` yeşil —
`docs/BILLING.md` tablosuna dokunulmadı.

---

## 3. Değişen dosyalar

**Şema / migration**
- `prisma/schema.prisma` — `Invoice`: `fxRate`, `fxRateDate`, `fxRateSource`, `grandTotalTryMinor`
- `prisma/migrations/add-invoice-fx-rate.sql` (yeni)
- `prisma/migrations/add-invoice-fx-rate.down.sql` (yeni)

**Kod**
- `src/lib/fx/tcmb.ts` (yeni) — TCMB istemcisi
- `src/lib/billing/invoice-writer.ts` — `resolveInvoiceFx` + kur adımı + iki skip sebebi
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — `exchangeRateFromRecord`
- `src/app/api/billing/invoices/[id]/export/route.ts` — dört kolon `select`
- `src/lib/env.ts` — `TCMB_BASE_URL`
- `.env.example` — `TCMB_BASE_URL` + açıklama (**commit EDİLMEDİ**: `.gitignore:34`
  `.env*` kalıbı `.env.example`'ı da yakalıyor, dosya depoda hiç takip edilmiyor —
  bkz. §5.5. Değişiklik yalnız bu makinede; kalıcı doküman `docs/EFATURA_SETUP.md`'de.)

**Test**
- `tests/invoice-fx-tcmb.test.ts` (yeni, 21 test)
- `tests/e2e/invoice-foreign-currency-export.spec.ts` — USD fixture'ı kur taşıyor
  (yoksa DB kısıtı reddediyor), + 2 yeni test (XML kur bloğu, DB'nin kursuz satırı
  reddi), başlık yorumu güncellendi

**Doküman**
- `docs/DATA_MODEL.md` — §11 tablosu + yeni §11.1
- `docs/EFATURA_SETUP.md` — koşullu engel + "TCMB kuru — 14. bir değişken YOKTUR"
- `docs/agent-results/ADR-0002-geli-tirici.md` (bu dosya) + `ADR-0002-evidence/`

---

## 4. Riskler

1. **CHECK `NOT VALID`.** Kural bundan sonraki yazımlara uygulanır; kural konmadan
   önce yazılmış döviz satırları (yerelde 1 adet QA verisi, üretimde bilinmiyor)
   yerinde kalır. Bunlar `foreignCurrencyFilingBlock` tarafından zaten GİB'e
   geçirilmiyor, ama kısıt "her satır" garantisi vermiyor. Ortam temizlenince
   `VALIDATE CONSTRAINT` çalıştırılmalı (SQL migration dosyasında yazılı).
2. **TCMB tek nokta bağımlılığı.** TCMB uzun süre erişilemezse TL dışı hiçbir fatura
   kesilmez ve `SystemAlert` birikir. Bu, kararın bilinçli sonucu — ama **otomatik
   yeniden deneme kuyruğu yok**: bugün fatura, ödeme yeniden işlendiğinde kesilir.
   Uzun kesintide bunu tetikleyecek bir job yok (bkz. §6).
3. **UBL-TR alan adları.** `PricingExchangeRate`/`TaxExchangeRate` Faz 1'de ikincil
   kaynaklardan alınmıştı ve **birebir GİB şemasından teyit edilmedi** (ADR-0002
   Seçenek (b) notu). Bu kart o teyidi yapmadı; entegratör adaptörü yazılırken
   doğrulanmalı.
4. **`fxRateDate` DATE, saat dilimi taşımaz.** Bilinçli: TCMB bülteni bir gündür,
   an değil. UI bu alanı "kur günü" olarak göstermeli, `issuedAt` gibi
   yerelleştirmemeli.
5. **Prod DB'ye dokunulmadı**, migration yalnız yerelde koşturuldu. Prod'a
   uygulanmadan önce `SELECT count(*) FROM "Invoice" WHERE currency <> 'TRY'`
   ölçülmeli.

---

## 5. Kapsam dışı gördüklerim — DÜZELTMEDİM, bildiriyorum

1. **`node_modules` içinde iki ayrı üretilmiş Prisma istemcisi vardı ve TypeScript
   ESKİ olanı çözüyordu.** `pnpm db:generate` şuraya yazıyor:
   `…/@prisma+client@7.10.0_…/node_modules/.prisma/client` (22:06), ama tsc ve node
   şurayı çözüyordu: `…/@prisma/client/node_modules/.prisma/client` (19:55, bayat).
   Sonuç: şemaya eklenen her kolon, `db:generate` başarıyla koşsa bile tip
   sisteminde ve çalışma zamanında **görünmüyordu** (bu kartta `fxRate does not
   exist in type … InvoiceUncheckedCreateInput` hatası buradan geldi).
   Bayat kopyayı geri alınabilir şekilde kenara aldım
   (`…/scratchpad/stale-prisma-backup/.prisma`) — `node_modules` derlenebilir bir
   çıktı, kaynak değil. **`pnpm install` bunu geri getirirse aynı sessiz hata
   herkeste tekrarlar; ayrı kart gerekiyor.**
2. **9 saatlik bayat `next dev` sunucusu (:3000, PID 66241, 13:22'den beri).**
   Bugün inen `paymentRef` ve `fxRate` kolonlarını bilmeyen bir Prisma istemcisiyle
   çalışıyordu; `Invoice`'a dokunan her rota **500** dönüyordu. E2E'yi bloke ettiği
   için **lider onayıyla** durduruldu ve testler taze bir sunucuda koştu.
   Ders: `prisma generate` sonrası dev sunucusu yeniden başlatılmalı.
3. **Yerel DB'de artık QA verisi:** `qa-fx-1788888018115-USD` / `…-TRY` —
   TASK-MTSWLWDONWA3W'den kalmış, `paymentRef: null`, gerçek fatura değil. Silmedim
   (yıkıcı işlem, benim verim değil). USD olanı `NOT VALID` kısıtının gerekçesi.
4. **`tsconfig.exe`** — depo kökünde takipsiz, adı ve içeriği anlamsız görünen bir
   dosya duruyor (`git status`). Dokunmadım.
5. **`.env.example` depoda takip EDİLMİYOR.** `.gitignore:34`'teki `.env*` kalıbı
   örnek dosyayı da yakalıyor (`git check-ignore -v .env.example` →
   `.gitignore:34:.env*`). Yani yeni bir ortam değişkeni eklendiğinde örnek dosya
   güncellense bile bu değişiklik kimseye ulaşmıyor; yeni kurulum yapan biri
   `.env.example`'ı depoda bulamıyor. Kalıp `.env*` yerine `.env` + `.env.local`
   … biçiminde daraltılmalı ya da `!.env.example` eklenmeli. Düzeltmedim (kapsam
   dışı, ayrıca başka kartların dosyalarını da etkiler).

---

## 6. Açık sorular

1. **Kur yüzünden kesilemeyen fatura kimin tetiğiyle kesilecek?** Bugün yalnız aynı
   ödemenin yeniden işlenmesiyle. Otomatik bir yeniden deneme işi (kuyruk + job)
   ayrı bir kart olarak açılsın mı? (Bu kartta soruldu, "kapsamı genişletir" diye
   ana çözüm olarak seçilmedi.)
2. **UBL-TR'de TL karşılığı tutarı ayrıca yazılmalı mı?** Bugün XML yalnız kuru
   taşıyor (`CalculationRate` + `Date`); `grandTotalTryMinor` kayıtta duruyor ama
   XML'de bir `LegalMonetaryTotal` TRY karşılığı olarak basılmıyor. GİB şeması bunu
   istiyorsa entegratör adaptörüyle birlikte eklenmeli.
3. **Prod'da kural öncesi döviz faturası var mı?** Prod DB erişimi bu ortamda yok;
   `VALIDATE CONSTRAINT` kararı buna bağlı.
4. **`ISTISNA` (ADR-0002 (c))** hâlâ açık ve bu kartın kapsamı dışında.

---

## 7. Sonraki adım

- `dev`'e commit (bu kart) — prod push yok, prod DB'ye dokunulmadı.
- Prod'a migration uygulanmadan önce §4.5'teki sayım.
- GİB env'leri 12-13 Eylül'de geldiğinde: entegratör adaptörü + §6.2'deki XML
  teyidi.

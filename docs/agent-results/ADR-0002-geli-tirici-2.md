# TASK-MTT1WUUS7MN7R — Fiyatlar KDV hariç + KDV müşterinin ülkesine göre

- **Ajan:** BE-EN (`geli-tirici`) · **Sprint:** S12 · **Branch:** `dev`
- **Karar:** Patron, 2026-09-08 — *"Fiyatlara KDV hariç, ülkelerin KDV oranlarına göre ekle. Örnek Türkiye %20 Kuveyt %0."*
- **Bağımlılık:** ADR-0002 Faz 2 (`43d73b0`) kapalı — `fxRate` alanları ve CHECK kısıtı yerinde.
- **Kapsam genişlemesi (patron, aynı gün, kart yazıldıktan SONRA):** tabloya 27 AB üyesi + ülke başına `regime` alanı. Kaynak: `.agentspace/memory/shared/fabrika-prices-are-vat-exclusive-per-country.md` (başka bir ajan kaydetti, kartımın id'sini adıyla anıyor). Uygulandı — bkz. §2.

---

## 1. Kararın iki yarısı, ve ikisini birden yapmak zorunda oluşum

Karar tek cümle ama iki ayrı yeri değiştiriyor:

1. **İlan edilen fiyat KDV hariçtir** → fiyat ekranlarında böyle etiketlenmeli.
2. **KDV alıcının ülkesine göre eklenir** → oran artık tek bir sunucu ayarı olamaz.

Kart (a)–(g) maddeleri **faturayı ve ekranı** tarif ediyor, **tahsilatı** değil.
Yalnız faturayı değiştirseydim ortaya tutarsız bir sistem çıkardı: fiyat sayfası
"KDV hariç" derken checkout hâlâ liste fiyatını çekiyor olacaktı — yani etiket
yalan olacaktı; ya da fatura KDV'yi ekleyip **tahsil edilmemiş** bir tutarı
belgeleyecekti (fatura ≠ makbuz).

**Bu yüzden checkout'u da değiştirdim** (`src/lib/billing/checkout-tax.ts` +
`src/app/api/billing/checkout/route.ts`): tahsil edilen tutar = liste fiyatı +
alıcının ülkesinin KDV'si. Bu, kartın harfiyen saymadığı ama kararın gerektirdiği
yarısıdır; **bilerek ve açıkça** yaptım, çünkü aksi hâlde §2.5'teki mutabakat
(`net + KDV = tahsil edilen`) hiçbir zaman tutmazdı. Bu bir fiyat/ tahsilat
davranışı değişikliğidir — geri alınmak istenirse tek dosya:
`checkout-tax.ts` çağrısını kaldırmak yeter.

---

## 2. Ne yapıldı

### (a) Ülke → oran verisi — `src/lib/billing/vat-rates.ts` (yeni)

Her satır: `country` · `ratePercent` · **`regime`** · `source` · `effectiveFrom` ·
`aliases`. Koda serpiştirilmiş sabit yüzde yok; oran isteyen herkes bu tabloyu
okuyor.

| Ülke | Oran | Rejim | Tarih | Kaynak |
|---|---|---|---|---|
| TR | %20 | `standard` | 2023-07-10 | Cumhurbaşkanı Kararı 7346 (RG 32241, 2023-07-07) |
| KW | %0 | `standard` | 2018-01-01 | GCC VAT Framework Agreement — Kuveyt uygulamaya koymadı |
| 27 AB üyesi | %17 (LU) – %27 (HU) | `unknown` | veri tarihi 2026-01-26 | Tax Foundation "VAT Rates in Europe" ← EC *Taxes in Europe Database v4* |

**KW neden `standard`/%0, `exempt` değil:** `exempt`, "KDV var ama bu teslim
onun dışında" demektir. Kuveyt'te KDV **kanunu yok**; yürürlükteki oran sıfır.

**AB oranlarını hafızadan yazmadım.** Kaynağı bu turda kendim çektim
(Tax Foundation tablosu, veri tarihi 2026-01-26, EC *Taxes in Europe Database v4*
atıflı); başka bir ajan aynı gün euvat.dev ile bağımsız doğrulamıştı ve iki
ölçüm örtüştü — **FI %25,5** dahil, ki bu oran alanının tam sayı olamayacağını
kanıtlayan satır.

### (b) Oran çözümü `vat-rate.ts` içinde KALDI — ikinci çözücü açılmadı

`resolveVatRate()` **aynı dosyada**, çünkü o dosyanın var oluş sebebi tam olarak
bu: yazıcı ile preflight'ın **tek** kuralı okuması (TASK-MTSYAKDK5LV9E). Yeni
tablo yanına ikinci bir çözücü koymak, kapının yeşil dediği bir satışı yazıcının
reddetmesi demek olurdu. Dört sonuç döner:

| Sonuç | Anlamı | Fatura |
|---|---|---|
| `resolved` | kaynaklı oran + `standard` rejim | **kesilir** |
| `country_missing` | fatura kimliğinde ülke yok | kesilmez |
| `country_not_in_table` | kaynaklı satır yok | kesilmez |
| `regime_not_chargeable` | satır var, oran var, **rejim kararı yok** (AB) | kesilmez |

Son ikisi **ayrı** raporlanıyor, çünkü çözümleri farklı: biri *kaynaklı satır*
ister, öteki *mali müşavir hükmü*. Zaten tabloda olan bir ülke için "ülkeyi ekle"
demek operatörü daire çizdirirdi.

### (c) Vergi ülkesi `TenantBillingIdentity`'den

`Tenant.country` **okunmuyor**: o alan kiracının kendi beyanıdır ve hiçbir yerde
doğrulanmaz — ona dayanmak, alıcının bir profil alanını değiştirerek kendi
vergisini seçebilmesi demek olurdu. Fatura kimliği olmayan kiracı zaten
`buyer_identity_missing` ile eleniyor; bu yüzden yazıcıda **kimlik okuma adımı
KDV adımının önüne alındı** — kim aldığını bilmeden oran çözülemez.

### (d) Bilinmeyen ülke → fatura yok + SystemAlert

`{ status: 'skipped', reason: 'vat_country_unknown' }`, **hiç satır yazılmaz**,
`SystemAlert(source: invoice_vat_country_unknown)`. Ödeme etkilenmez. Alert ülkeyi
ve tabloyu adıyla yazar, **alıcıyı/VKN'yi/tutarı yazmaz** (testle sabitlendi).

### (e) "KDV hariç" ibaresi — i18n, iki dil

`billingPanels.pricing.vatExclusiveNote` + `billingPanels.settings.vatExclusiveNote`,
`messages/tr.json` ve `messages/en.json`. Halka açık fiyat sayfasında ve kiracının
faturalandırma panelinde, fiyatın hemen altında (`data-testid="vat-exclusive-note"`).
`docs/BILLING.md` §1 uyarı kutusu + yeni **§1.2**.

### (f) KDV aritmetiği `src/lib/money.ts`'te

`vatOnNetMinor(netMinor, ratePercent)` ve `grossFromNetMinor(...)`. Minor unit tam
sayı, yarım-yukarı. Yuvarlama üç yerde kopyalanmıştı (`invoice-writer`, `efatura`,
`invoice-list`) ve **tesadüfen** aynıydı; `decomposeGrossAmount` artık bu tek
fonksiyonu çağırıyor. Oranın ondalıklı olması (FI %25,5) tutarı ondalıklı yapmaz.

### (g) `INVOICE_VAT_RATE`'in yeni rolü: **YOK — emekliye ayrıldı**

Hiçbir oranı belirlemiyor; yazıcı artık okumuyor, çağrı yerlerinden
(`subscription-sync.ts`, `iyzico.ts`) üçüncü argüman kaldırıldı. **Şemadan
silinmedi**: hâlâ set eden bir kurulum, sessizlik yüzünden o sayının çalıştığını
sanmaya devam ederdi. Preflight tablosunda **`(YOK SAYILIR)`** olarak, `required:
false` satırında raporlanıyor.

Preflight'ın KDV bloğu artık env değil, **yazıcının soracağı soruyu** soruyor —
aynı `resolveVatRate` üzerinden: *satıcının ülkesi için tabloda `standard` rejimli
kaynaklı satır var mı?* Böylece ikisi tanım gereği ayrışamaz (§2.4).

---

## 3. Kanıt (kopyalanmış gerçek çıktı)

### 3.1 ÇÜRÜTME SONDASI — `TR` satırı geçici olarak kaldırıldı

**(A) Tablo yerinde:**

```
sourced countries in the table: TR, KW, AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE
resolveVatRate("Türkiye") -> {"status":"resolved","ratePercent":20,"country":"TR","source":"Cumhurbaşkanı Kararı 7346 (Resmî Gazete 32241, 2023-07-07) — KDV genel oranı %20","effectiveFrom":"2023-07-10"}
```

**(B) `TR` satırı KALDIRILDI:**

```
resolveVatRate("Türkiye") -> {"status":"country_not_in_table","country":"Türkiye","detail":"no sourced VAT rate for Türkiye; src/lib/billing/vat-rates.ts can charge KW"}

──────── TR buyer (Türkiye) ────────
net list price   : 4500 minor (USD $45.00, KDV hariç)
charged by checkout: 4500 minor  (net + 0% VAT)
createInvoiceForPayment -> {"status":"skipped","reason":"vat_country_unknown"}
SELECT count for this buyer country -> [{"n":0}]
No row was written, so no VAT figure exists to be wrong.
```

→ **Sessizce %0 uygulanmadı**: hiç satır yazılmadı, dolayısıyla yanlış olabilecek
bir KDV rakamı hiç oluşmadı. Aynı koşuda **KW faturası kesilmeye devam etti** —
aranan ayrım tam da bu: KW'nin %0'ı bir *cevap*, TR'nin yokluğu bir *boşluk*.

Yazılan alert (DB'den okundu):

```json
{ "source": "invoice_vat_country_unknown",
  "meta": { "detail": "no sourced VAT rate for Türkiye; src/lib/billing/vat-rates.ts can charge KW",
            "reason": "country_not_in_table", "regime": null,
            "country": "Türkiye", "provider": "stripe", "tenantId": "demo-tenant" } }
```

**(C) Geri konuldu:** `diff -q` → `RESTORE EXACT`; `resolveVatRate("Türkiye")`
yeniden `resolved / 20 / TR`, fatura kesiliyor (§3.2).

### 3.2 Gerçek ödeme → `Invoice` satırı, DB'den `SELECT` ile okundu

Her koşu geri alınan bir transaction içinde (`Invoice rows before: 2` → `after: 2`).

**TR (%20):**

```
net list price   : 4500 minor (USD $45.00, KDV hariç)
charged by checkout: 5400 minor  (net + 20% VAT)
createInvoiceForPayment -> {"status":"issued","number":"FB-2026-000001", ...}
SELECT * FROM "Invoice" (stored row):
[ { "number": "FB-2026-000001", "currency": "USD", "buyerCountry": "Türkiye",
    "lines": [ { "name": "Fabrika Basic — aylık abonelik", "vatRate": 20,
                 "quantity": 1, "unitCode": "MON", "unitPriceMinor": 4500 } ],
    "fxRate": "48.372700", "grandTotalTryMinor": 261213 } ]
reconciliation: net 4500 + VAT 900 = 5400  (charged 5400) -> MATCHES
net stored equals the VAT-exclusive list price? YES
```

**KW (%0):**

```
charged by checkout: 4500 minor  (net + 0% VAT)
SELECT * FROM "Invoice" (stored row):
[ { "number": "FB-2026-000001", "currency": "USD", "buyerCountry": "Kuveyt",
    "lines": [ { ... "vatRate": 0, "unitPriceMinor": 4500 } ],
    "fxRate": "48.372700", "grandTotalTryMinor": 217677 } ]
reconciliation: net 4500 + VAT 0 = 4500  (charged 4500) -> MATCHES
net stored equals the VAT-exclusive list price? YES
```

İki satırda da saklanan birim fiyat **liste fiyatının kendisi** (4500) — "fiyat
KDV hariçtir" iddiasının kayıt üzerindeki karşılığı budur. ADR-0002 Faz 2 ile de
çakışmıyor: `fxRate`/`grandTotalTryMinor` dolmaya devam ediyor.

### 3.3 Tahsilat yarısı — gerçek HTTP (`POST /api/billing/checkout`)

```
buyerCountry = Türkiye  → HTTP 200
{ "totalMinor": 4500, "tax": { "country": "TR", "ratePercent": 20, "vatMinor": 900, "resolved": true },
  "grossTotalMinor": 5400, "currency": "USD" }

buyerCountry = Kuveyt   → HTTP 200
{ "totalMinor": 4500, "tax": { "country": "KW", "ratePercent": 0, "vatMinor": 0, "resolved": true },
  "grossTotalMinor": 4500, "currency": "USD" }

buyerCountry = Belçika  → HTTP 200
{ "totalMinor": 4500, "tax": { "country": null, "ratePercent": 0, "vatMinor": 0, "resolved": false },
  "grossTotalMinor": 4500, "currency": "USD" }
```

`resolved: false` alanı bilerek var: çağıran **"%0 çünkü öyle"** ile **"0 çünkü
bilmiyoruz"** arasını ayırabilsin diye. `totalMinor` eskisi gibi **KDV hariç**
kaldı (mevcut çağıranlar ve `plan-storefront.spec.ts` onu okuyor); KDV ve tahsil
edilecek tutar **ek** alanlar. Sonda kendi yazdığı `TenantBillingIdentity`
satırını sildi (`table back to: 0 rows`).

### 3.4 "KDV hariç" ibaresi — iki dilde, gerçek sayfadan

```
=== /tr/pricing ===
data-testid="vat-exclusive-note" ...>Fiyatlar KDV hariçtir. KDV, ödeme adımında alıcının ülkesine göre eklenir (Türkiye %20, Kuveyt %0).</div>
=== /en/pricing ===
data-testid="vat-exclusive-note" ...>Prices exclude VAT. VAT is added at checkout according to the buyer’s country (Türkiye 20%, Kuwait 0%).</div>
```

### 3.5 Preflight ile yazıcı ayrışmıyor (madde g)

`TR` satırı yokken, **`INVOICE_VAT_RATE=20` set edilmiş olmasına rağmen** kapı kırmızı:

```
2. Vergi (KDV) Bloğu    : ❌ EKSİK (vat-rates.ts:Türkiye)
   ↳ KDV oranı artık ALICININ ÜLKESİNDEN gelir (kaynaklı ülkeler: KW).
     INVOICE_VAT_RATE yok sayılır; kaynaklı satırı olmayan ülkeye fatura KESİLMEZ.
📌 Fatura kaydı hiç oluşturulmaz: Türkiye için src/lib/billing/vat-rates.ts içinde kaynaklı bir KDV oranı yok. SystemAlert (invoice_vat_country_unknown) yazılır, ödeme etkilenmez. ...
```

`TR` geri konunca, aynı env ile yeşil:

```
2. Vergi (KDV) Bloğu    : ✅ TANIMLI (Fatura kaydı yazılabilir)
   ↳ KDV oranı artık ALICININ ÜLKESİNDEN gelir (kaynaklı ülkeler: TR, KW).
📌 Fatura kaydı oluşturulur. Fatura belgesi üretilir. GİB'e gönderilmez, sebep: EFATURA_INTEGRATOR_* eksik.
```

Kapıyı kurtaran şey env değişkeni değil, **tablo satırı** — yazıcının davrandığı gibi.

### 3.6 Kapı

```
### pnpm typecheck
$ tsc --noEmit
(temiz)

### pnpm lint
$ eslint
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts   10:7  warning  'R' is assigned a value but never used
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts    5:28  warning  '_url' is defined but never used
✖ 2 problems (0 errors, 2 warnings)      ← ikisi de BAŞKA bir kartın kanıt dosyasından

### pnpm test
 Test Files  1 failed | 128 passed | 2 skipped (131)
      Tests  4 failed | 1527 passed | 8 skipped (1539)
 FAIL  tests/gdpr-data-subject.live.test.ts  (4 test — BENİM DEĞİL, bkz. §4)
```

**Kendi dokunduğum test yüzeyi, birlikte koşturuldu — hepsi yeşil:**

```
pnpm exec vitest run tests/vat-by-country.test.ts src/lib/billing/invoice-writer.test.ts \
  tests/efatura-unit.test.ts tests/invoice-fx-tcmb.test.ts src/lib/billing/catalog.test.ts \
  src/lib/money.test.ts src/lib/billing/subscription-sync.test.ts src/lib/iyzico.test.ts \
  tests/efatura-foreign-currency.test.ts tests/invoice-document.test.ts tests/billing-invoice-list.test.ts

 Test Files  11 passed (11)
      Tests  240 passed (240)
```

`catalog.test.ts` yeşil → `docs/BILLING.md` tablosu bozulmadı (yeni bölüm
`### Kredi maliyeti (eylem başına)` başlığının **öncesine** kondu; ayrıştırıcı
o başlıktan sonrasını okuyor).

---

## 4. Paylaşılan ağaç — kırmızıyı sahiplenmiyorum, ATFEDİYORUM

`pnpm test` iki koşuda farklı kırmızı verdi. Ölçüm:

**23:09 koşusu: 1513 test, TAMAMEN YEŞİL** (henüz AB genişlemesi yokken).
**23:13 koşusu:** `tests/cordis-delta.test.ts` 3 kırmızı.
**23:20 koşusu:** cordis düzeldi, `tests/gdpr-data-subject.live.test.ts` 4 kırmızı.

Aradaki fark benim dosyalarım değil:

| Kırmızı | Sahibi | Ölçüm |
|---|---|---|
| `tests/cordis-delta.test.ts` (3) | RAG/AiUsageLog kartı | `git status` → ` M src/lib/rag.ts` (benim değil, commit edilmemiş). `cordis-delta.ts:298` → `ingestDocument` → `rag.ts`. Diff'lerinde yeni `throw`'lar var (`refusing to store … yields no chunks`). Sonraki koşuda kendiliğinden düzeldi. |
| `tests/rag-ingest-silent-failure.test.ts`, `tests/rag-pdf-ingest-partial.test.ts` (typecheck TS2493/TS2352) | aynı kart | İkisi de `??` **takipsiz, yeni** dosya — benim değil |
| `tests/gdpr-data-subject.live.test.ts` (4) | Silme/erasure kartı (A4 seçenek C) | ` M tests/gdpr-data-subject.live.test.ts`, ` M src/lib/inngest/jobs/users-scheduled-deletion.ts`, `?? prisma/migrations/relationship-owner-nullable.sql` — üçü de o kartın, hepsi commit edilmemiş |

Testin modül grafiğinde benim değiştirdiğim hiçbir dosya yok (import listeleri
`prisma`, `pg`, `crypto`); kendi test yüzeyim 240/240 yeşil. **Düzeltmedim.**
GDPR kırmızısının tam mekanizmasını teşhis etmedim — bir hipotezim (`ownerUserId`
NOT NULL kalmış olabilir) ölçümle çürüdü (`is_nullable: YES`), o yüzden sebep
konusunda iddiada bulunmuyorum; dosya o kartın ve hâlâ değişim altında.

### ⚠️ COMMIT KAPSAMI — benim değişikliğim BAŞKASININ commit'ine karıştı

`src/lib/billing/subscription-sync.ts`'te yaptığım değişiklik (`vatRateRaw`
argümanının ve artık kullanılmayan `env` import'unun kaldırılması) **benim
commit'imde değil**: `df209ec fix(billing): match the stripe webhook idempotency
guard on the event id` (TASK-MTSY88Q6AMCGB, oturum `…01PPkifvS1Khom7DpYKakcVo`)
onu içine almış. Ölçüm:

```
$ git show df209ec -- src/lib/billing/subscription-sync.ts | grep -E "^[-+].*(vatRateRaw|No third argument|import \{ env)"
-import { env } from '@/lib/env';
-      { vatRateRaw: env.INVOICE_VAT_RATE }
+      // No third argument: the VAT rate is no longer a server setting. It comes
```

`git add` + `git commit` atomik olmadığı için oldu; dördümüz aynı ağaçtayız.
**Geçmişi `reset`/`rebase` ile düzeltmeye çalışmadım** — o commit'in sahibinin
işini yok ederdim. Kod ağaçta doğru ve çalışıyor (testler yeşil); yalnız
**atıf** yanlış: o satırlar TASK-MTT1WUUS7MN7R'ye ait, TASK-MTSY88Q6AMCGB'ye değil.

### 🔒 DOSYA SAHİPLİĞİ İHLALİ — bildiriyorum, dokunmadım

Bu turun kuralı: *"`prisma/schema.prisma` + migration YALNIZ geli-tirici'nindir."*
Ölçüm: **`prisma/schema.prisma` şu anda BAŞKA bir ajan tarafından değiştirilmiş
durumda** (`Relationship.ownerUserId` → nullable, A4 seçenek C yorumuyla) ve yanına
`prisma/migrations/relationship-owner-nullable.sql` + `.down.sql` eklenmiş
(takipsiz). Ben bu kartta şemaya **hiç dokunmadım**. Geri almadım, düzeltmedim —
kilidi ihlal eden değişikliği sahibinin sürdürmesi gerekiyor; ama kilit
duyurulduğu hâliyle tutmadı ve bunun bilinmesi lazım.

---

## 5. Değişen dosyalar

**Kod (yeni)**
- `src/lib/billing/vat-rates.ts` — ülke→oran+rejim tablosu, kaynak + tarih + alias
- `src/lib/billing/checkout-tax.ts` — tahsilat tarafının KDV'si

**Kod (değişen)**
- `src/lib/billing/vat-rate.ts` — `resolveVatRate` (tek çözücü) + `retiredVatRateSetting`
- `src/lib/money.ts` — `vatOnNetMinor`, `grossFromNetMinor`
- `src/lib/billing/invoice-writer.ts` — kimlik→ülke→oran sırası, `vat_country_unknown`, `vatRateRaw` kaldırıldı
- `src/lib/iyzico.ts` — üçüncü argüman kaldırıldı
- `src/lib/billing/subscription-sync.ts` — üçüncü argüman kaldırıldı, **ama bu değişiklik `df209ec` içinde kaldı** (bkz. §4)
- `src/app/api/billing/checkout/route.ts` — KDV kalemi + `tax`/`grossTotalMinor`
- `src/app/[locale]/pricing/PricingClient.tsx`, `.../settings/billing/BillingClient.tsx` — ibare
- `scripts/efatura-preflight.ts` — KDV bloğu artık tabloya bakıyor

**i18n**
- `messages/tr.json`, `messages/en.json` — `billingPanels.{pricing,settings}.vatExclusiveNote` (+2 satır, başka hiçbir şeye dokunulmadı)

**Test**
- `tests/vat-by-country.test.ts` (yeni, 31 test)
- `src/lib/billing/invoice-writer.test.ts`, `tests/efatura-unit.test.ts`, `tests/invoice-fx-tcmb.test.ts` — yeni kurala göre güncellendi

**Doküman**
- `docs/BILLING.md` — §1 uyarı kutusu + yeni §1.2
- `docs/agent-results/ADR-0002-geli-tirici-2.md` (bu dosya) + `ADR-0002-evidence-2/` (sonda betikleri)

**`.env.example`:** `INVOICE_VAT_RATE` açıklaması güncellenmedi — dosya
`.gitignore:34` (`.env*`) yüzünden depoda **hiç takip edilmiyor** (önceki kartta
da bildirdim). Kalıcı yer `docs/BILLING.md` §1.2.

---

## 6. Açık sorular — MALİ MÜŞAVİRE

**Kod patronun kuralını uyguluyor; aşağıdakileri kendi başıma karara bağlamadım
ve vergi kuralı icat etmedim.** Veri yapısı (`regime`) bu ayrımları taşıyabilecek
şekilde kuruldu; bugün AB üyelerinin hepsi `unknown` ve fatura kesilmiyor.

1. **Hizmet ihracatı istisnası (KDVK 11/1-a, 12/2).** Türkiye'den yurt dışındaki
   müşteriye verilen hizmet, şartları sağlarsa KDV'den istisnadır. Kuveyt'e
   bugün %0 uyguluyoruz ama gerekçesi *"Kuveyt'te KDV yok"* — oysa doğru gerekçe
   *"Türkiye'de ihracat istisnası"* olabilir ve o zaman fatura `invoiceType:
   ISTISNA` olmalı, `SATIS` değil. **Hangi gerekçe geçerli ve fatura tipi ne olmalı?**
2. **AB B2B tersine yükümlülük (reverse charge).** Türkiye mukimi bir satıcı,
   AB'deki KDV mükellefi bir işletmeye normalde AB KDV'si tahsil etmez; yükümlülük
   alıcıdadır. **Doğru mu? Öyleyse AB üyelerinin rejimi `reverse_charge` mi olmalı,
   ve belgeye hangi ibare yazılmalı?**
3. **AB B2C dijital hizmet.** Tüketiciye satışta Birlik-dışı OSS şemasına kayıt
   ve **tüketicinin** ülkesinin oranı gündeme gelebilir. **Fabrika B2C satıyor mu,
   satacaksa OSS kaydı gerekiyor mu?**
4. **Alıcının mükellef olup olmadığını nasıl bilebiliriz?** B2B/B2C ayrımı
   yukarıdaki iki maddeyi belirliyor. VIES doğrulaması gerekiyor mu, `TenantBillingIdentity`
   hangi alanı taşımalı?
5. **Mukimlik kanıtı.** Bugün vergi ülkesi kiracının *beyan ettiği* fatura
   adresinden geliyor. Vergi kararı için bu yeterli mi, yoksa VKN/VAT-ID
   doğrulaması mı gerekiyor? (ADR-0002 (c) `ISTISNA` kartı da aynı soruda takılı.)
6. **Kur ile KDV'nin sırası.** USD fatura + TL karşılığı: KDV önce USD üzerinden
   hesaplanıp sonra mı TL'ye çevriliyor, yoksa TL karşılığı üzerinden mi
   hesaplanmalı? Bugün ilki yapılıyor (§3.2). Beyan açısından fark yaratır mı?

---

## 7. Riskler

1. **Checkout artık daha fazla tahsil ediyor** (TR'de +%20). Kararın gereği ama
   canlıya çıkmadan önce fiyat sayfası/İK metinlerinin ve mevcut abonelerin
   yenileme tutarlarının gözden geçirilmesi gerekir — **mevcut abonelikler için
   geçiş kuralı bu kartta yok.**
2. **Vergi kimliği olmayan kiracı net tutardan tahsil edilir ve faturası
   kesilmez.** Kasıtlı (funnel'ı kapatmamak için), ama `TenantBillingIdentity`'yi
   dolduran ekran hâlâ yok (TASK-MTSY71BUMBLWM) — o kart kapanmadan bu boşluk
   üretimde görünür hâle gelir.
3. **AB oranları `unknown` rejimle duruyor.** Rejim `standard`'a çevrilirse bu
   27 rakam tahsil edilmeye başlar; çevirmeden önce §6.2 cevaplanmalı.
4. **`effectiveFrom` AB satırlarında yürürlük tarihi değil, kaynağın veri
   tarihidir** (2026-01-26). Geriye dönük fatura için yanıltıcı olabilir; bugün
   hepsi `unknown` olduğu için faturaya giremiyor.
5. **Prod DB'ye dokunulmadı**, şemaya dokunulmadı, migration eklenmedi — bu kart
   yalnız kod + veri + doküman.

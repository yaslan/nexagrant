# TASK-MTSWLWDONWA3W — Yabancı para faturada TCMB kuru (QA 3. tur: Faz 2 doğrulaması)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Tip:** doğrulama + düzeltme
**Doğrulanan ağaç:** `9b6d412` (+ diğer ajanların commit'lenmemiş VAT/RAG çalışması) ·
**Önceki turlar:** `-blockzincir-pm.md`, `-blockzincir-pm-2.md`, `-blok-zincir-denet-i.md`, `-blok-zincir-denet-i-2.md`
**Not:** `-2.md` `311c902`'de doğrulanmıştı; o rapor **bayat**. Aradaki 38 commit'te
ADR-0002 karara bağlandı (`1e4e6b7`, Seçenek b) ve Faz 2 indi (`c029e1c`, `43d73b0`).
Bu tur o inen işi ölçer.

## Karar

**Kartın literal talebi artık karşılanıyor: yayına uygun.** USD/EUR faturası kendi para
biriminde kesiliyor, TCMB döviz alış kuru + bülten tarihi + TL karşılığı hem kayıtta hem
belgede duruyor, ve kursuz belge hâlâ GİB'e gidemiyor. Bu turda **1 kusur (F-4) bulundu,
kök nedeni giderildi ve aynı testle yeşile alındı**.

## 1. Ne yapıldı

Grep ile değil, **gerçek üretim yolundan geçirilerek**: canlı Postgres, gerçek
`createInvoiceForPayment`, gerçek TCMB bülteni (ağ), gerçek `buildInvoiceDocument` →
`fileThrough` → `generateUblTrXml`/`generateEfaturaHtml`. Yazılan her satır rollback edildi.
Sonda: `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/probe-fx-verify-r3.mts`
Tam çıktı: `.../09-GREEN-r3-full-run.txt` · düzeltme öncesi belge: `.../07b-BEFORE-f4-usd-no-tl-equivalent.html`

## 2. Kanıt

### 2.1 Şema gerçekten var (information_schema'ya soruldu, tipe değil)

```
[{"column_name":"currency","data_type":"text","is_nullable":"NO"},
 {"column_name":"fxRate","data_type":"numeric","is_nullable":"YES"},
 {"column_name":"fxRateDate","data_type":"date","is_nullable":"YES"},
 {"column_name":"fxRateSource","data_type":"text","is_nullable":"YES"},
 {"column_name":"grandTotalTryMinor","data_type":"integer","is_nullable":"YES"}]

CHECK Invoice_fx_required_for_foreign_currency  (convalidated=false / NOT VALID)
  currency='TRY' OR (fxRate IS NOT NULL AND fxRate>0 AND fxRateDate IS NOT NULL
                     AND fxRateSource IS NOT NULL AND grandTotalTryMinor IS NOT NULL)
```

Kısıt **tanımlı-ama-etkisiz değil**; kursuz bir USD satırı elle INSERT edilmeye çalışıldı:

```
INSERT of a rate-less USD invoice: REJECTED -> Code 23514
  new row for relation "Invoice" violates check constraint
  "Invoice_fx_required_for_foreign_currency"
```

(`NOT VALID` yalnız *mevcut* iki satırı doğrulamadan geçiriyor — yeni her yazma denetleniyor.)

### 2.2 Gerçek yol: USD 99,00 tahsilat

```
createInvoiceForPayment(USD) -> {"status":"issued","number":"FB-2026-000001",...}
stored: {"currency":"USD","fxRate":48.3727,"fxRateDate":"2026-09-08",
         "fxRateSource":"TCMB","grandTotalTryMinor":478890}
TL math: round(9900 * 48.3727) = 478890 vs stored 478890 -> MATCH
foreignCurrencyFilingBlock -> null
fileThrough -> {"status":"filed",...} (filed=true, reachedAdapter=true)
```

**Kur uydurulmuş değil — bağımsız olarak TCMB bülteniyle karşılaştırıldı:**

```
$ curl https://www.tcmb.gov.tr/kurlar/202609/08092026.xml
USD Unit 1 ForexBuying 48.3727     EUR Unit 1 ForexBuying 56.1800
```

Kayda giren: USD 48.3727 · EUR 56.18. **Birebir**, ve *satış* değil *alış* kuru (VUK 280).

### 2.3 Hafta sonu kayması (gerçek 404'lerle)

```
USD, tahsilat 2026-09-06 (Pazar) -> rate 48.2326, bülten 2026-09-04
ground truth: 06092026 -> HTTP 404 | 05092026 -> HTTP 404 | 04092026 -> HTTP 200, ForexBuying 48.2326
```

Kullanılan günün faturaya yazılması sayesinde kayma **görünür**, ima edilmiş değil.

### 2.4 TCMB kesintisi — fatura kesilmiyor, uydurma kur yok

`TCMB_BASE_URL=http://127.0.0.1:1` ile aynı gerçek yol:

```
createInvoiceForPayment(USD) -> {"status":"skipped","reason":"fx_rate_unavailable"}
Invoice rows after: 2 (değişmedi)
SystemAlert: level=error source=invoice_not_issued
  "A payment was taken in USD but the TCMB buying rate ... could not be established,
   so no invoice was issued. ... the last known rate is deliberately not substituted.
   The payment is unaffected"
  meta.detail = "unreachable: http://127.0.0.1:1/202609/08092026.xml: fetch failed"
--- aynı kesintide TRY faturası: issued, filed=true  (TRY akışı kesintiden etkilenmiyor)
```

### 2.5 Kapı koşullu hale geldi ama açılmadı

```
kur taşıyan USD belgesi   -> filed=true,  reachedAdapter=true
kursuz USD belgesi        -> {"status":"blocked","code":"FOREIGN_CURRENCY_NO_TL_EQUIVALENT"}
                             reachedAdapter=false
TRY belgesi               -> filed=true (regresyon yok)
```

### 2.6 F-4 — BULUNDU: TL karşılığı hiçbir belgede yazmıyordu

Düzeltme öncesi, gerçek üretilen belgeden:

```
HTML money symbols seen: ["$82,50","$16,50","$99,00"]
HTML mentions TCMB / kur / TL karşılığı?  false false false
XML mentions a TRY amount anywhere?  false
belge metni: ... Para Birimi: USD ... ÖDENECEK GENEL TOPLAM: $99,00 ...
```

Yani kur ve ₺4.788,90 **satırda** duruyordu; müşterinin aldığı PDF'te ve GİB'e giden
XML'in tutar tarafında **hiç yoktu**. VUK 215 TL karşılığının fatura *üzerinde
gösterilmesini* ister; `docs/MALI_MUSAVIR_SORULARI.md` §6'daki kendi okumamız da
"kur + TL karşılığı + kullanılan kurun tarihi faturaya yazılır" diyor.

**Kırmızı → düzeltme → yeşil** (test gevşetilmedi, 5 yeni test eklendi):

```
ÖNCE:  × the printable invoice shows the rate, the bulletin date and the lira total
       × the lira sign appears only on the lira figure — the sale is still in USD
       × the filed XML carries the lira figure, not only the rate to compute it with
       × a rate with no recorded lira total prints the rate and invents no total
       Tests  4 failed | 10 passed
SONRA: Tests  14 passed (14)
```

Düzeltme sonrası aynı gerçek yolun çıktısı:

```
HTML: ... ÖDENECEK GENEL TOPLAM: $99,00 | TL karşılığı: ₺4.788,90
      | TCMB döviz alış kuru (2026-09-08): 1 USD = 48,3727 TRY
XML:  <cbc:Note>TCMB döviz alış kuru (2026-09-08): 1 USD = 48,3727 TRY
      — ödenecek genel toplamın TL karşılığı: 4.788,90 TRY</cbc:Note>
TRY faturası: ne satır ne not eklendi (regresyon yok)
```

Tarayıcı ekran görüntüsü (gerçek render):
`docs/agent-results/TASK-MTSWLWDONWA3W-evidence/10-browser-USD-with-tl-equivalent.png`
ve TRY karşılaştırması `10-browser-TRY-with-tl-equivalent.png`.

TL rakamı **satırdan okunur, yeniden çarpılmaz**: kayıtlı toplamı olmayan bir belge
yalnız kuru basar, toplam uydurmaz (bu da testle sabitlendi).

### 2.7 Kapı

```
$ pnpm gate
  lint      ✓ 0 error (2 warning — başka ajanın evidence probe'ları, benim değil)
  typecheck ✓ exit 0
  test      ✓ Test Files 129 passed | 2 skipped · Tests 1536 passed | 8 skipped
  rls:check ✓ 43/43 model
  rls:verify ✓ fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma/yazma/çapraz-yazma reddedildi
```

## 3. Değişen dosyalar

- `src/lib/efatura.ts` — `InvoiceExchangeRate.tryEquivalentMinor`, yeni
  `exchangeRateStatement()`, basılan belgeye "TL karşılığı" + kur satırı, XML'e `cbc:Note`
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — satırdaki
  `grandTotalTryMinor` belgeye taşınıyor
- `tests/efatura-foreign-currency.test.ts` — F-4 için 5 regresyon testi
- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`, `docs/EFATURA_SETUP.md` — F-4 kaydı
- `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/` — sonda, üretilen HTML/XML, ekran görüntüleri

## 4. Riskler

1. **XML'de TL rakamı `cbc:Note` içinde, yapısal bir elemanda değil.** Note UBL-TR'de
   tekrarlanabilir ve şema-güvenli; ama entegratörün TL toplamı ayrıca yapısal olarak
   (ör. TRY cinsinden ikinci bir `TaxTotal`) isteyip istemediği **teyit edilmedi** —
   entegratör görüşmesinde sorulacaklar listesine girmeli. Bugünkü hâl eksik değil,
   ama "GİB şemasından birebir teyitli" de değil.
2. `foreignCurrencyFilingBlock` yalnız **kurun** varlığına bakıyor, kayıtlı TL toplamına
   değil. Gerçek yolda fark etmez (DB kısıtı ikisini birlikte zorunlu kılıyor); yalnız
   elle kurulmuş bir belge kur taşıyıp TL toplamı taşımayabilir — o belge de kuru
   basar, toplam uydurmaz. Kapıyı sıkmak ayrı ve bilinçli bir karar olmalı.
3. `Invoice_fx_required_for_foreign_currency` **NOT VALID**: DB'deki iki eski sonda
   satırı (biri kursuz USD) doğrulanmadan duruyor. Gönderimde kapı onları zaten
   `blocked` ediyor. Prod'a geçmeden `VALIDATE CONSTRAINT` koşulmalı.
4. **Paylaşılan ağaç:** çalışma sırasında `src/lib/billing/invoice-writer.test.ts`
   (başka ajanın commit'lenmemiş VAT işi) 23:2x'te bir tur `error TS2339: Property
   'meta' does not exist` verip kapıyı kırdı; ~20 sn sonra o ajan düzeltti ve
   typecheck exit 0'a döndü. **Benim değişikliğim değildi**, bu turda kapı temiz.

## 5. Açık sorular

1. Entegratör TL toplamını yapısal olarak da istiyor mu (Not yeterli mi)? — vendor görüşmesi.
2. `ISTISNA` (ihracat) faturası kuraldan muaf mı? ADR-0002 kapsam dışı bıraktı, hâlâ açık.
3. GİB env'leri 2026-09-12/13'te geliyor; `VALIDATE CONSTRAINT` ve sandbox ucu o tarihte
   gerçek entegratöre karşı bir kez daha koşulmalı.

## 6. Sonraki adım

1. Bu kart **kapanabilir** — literal talep (TCMB kuru + TL karşılığı) kayıtta, XML'de ve
   belgede kanıtlı.
2. Entegratör görüşmesine "TL toplamı yapısal olarak isteniyor mu" sorusunu ekle.
3. Prod öncesi `ALTER TABLE "Invoice" VALIDATE CONSTRAINT
   "Invoice_fx_required_for_foreign_currency";`

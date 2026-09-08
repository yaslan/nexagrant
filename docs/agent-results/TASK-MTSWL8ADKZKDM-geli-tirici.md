# TASK-MTSWL8ADKZKDM — Ödeme başarılı olduğunda Invoice satırı yazılıyor

**Ajan:** geli-tirici (Backend Mühendisi) · **Sprint:** SPRINT-S12 · **Dal:** dev
**Durum:** kod ve doğrulama tamam · **Canlıda kesilecek fatura sayısı bugün hâlâ sıfır** — sebebi §5'te, bu kartın kapsamı dışında.

---

## 1. Ne yapıldı

Liderin ölçümü yeniden ölçüldü ve **doğrulandı**: `Invoice` tablosu, UBL-TR üreteci, export
rotası ve e-Fatura preflight'ı vardı; **hiçbir üretim kodu satır yazmıyordu**. Her iki ödeme
yolu da yalnız `AuditEvent` yazıyordu.

Yapılanlar:

1. **Tek ortak yazıcı:** `src/lib/billing/invoice-writer.ts` → `createInvoiceForPayment()`.
   Stripe (`subscription-sync.ts` → `logInvoicePayment`) ve iyzico (`iyzico.ts` webhook
   senkronu) **ikisi de** onu çağırır. Kod iki yere kopyalanmadı.
2. **Alıcı kimliği için bir yer açıldı** — `TenantBillingIdentity`. Şemada bunu tutan hiçbir
   yer yoktu (§4). Kimlik yoksa **fatura kesilmez**, `SystemAlert` eksik alanları adıyla sayar.
3. **`Invoice.paymentRef`** (kiracı içinde benzersiz) — yeniden iletilen webhook ikinci belge kesemez.
4. **Numara** `FB-<yıl>-<6 hane>`, kiracı içinde artan, unique indeks + yeniden deneme ile yarışa dayanıklı.
5. **KDV `INVOICE_VAT_RATE`'ten okunur, varsayılanı yoktur.** Boşken fatura kesilmez.
6. **`gibEnvelopeId` NULL** kaldı; belge "mali değeri yoktur" damgasını taşıyor. Bozulmadı.
7. `iyzico.ts`'teki bayat `"There is no Invoice table"` yorumu düzeltildi.
8. `docs/DATA_MODEL.md` §11.1 ve `docs/EFATURA_SETUP.md` güncellendi (migration + RLS aynı commit'te).

**Dokunulmadı:** `src/lib/efatura.ts`, `src/lib/efatura-integrator.ts`, export rotası, preflight.

---

## 2. Kanıt

### 2.1 Kusur yeniden ölçüldü (dev @ `aa11d85`)

```
$ grep -rniE "invoice\.(create|upsert|createMany)|INSERT INTO \"?Invoice" src scripts prisma tests workers
tests/e2e/invoice-export-real-record.spec.ts:81:      prisma.invoice.create({
tests/e2e/billing-invoice-history.spec.ts:90:    await prisma.invoice.create({
```

İki test dosyası, sıfır üretim yazıcısı. Liderin ölçümü doğrulandı.

### 2.2 Migration additive + idempotent (İKİ KEZ koşuldu)

```
$ for i in 1 2; do docker exec -i postgres-vector psql -U fabrika -d fabrika -v ON_ERROR_STOP=1 \
    -f - < prisma/migrations/add-invoice-write-path.sql; done
=== RUN 1 ===
BEGIN
CREATE TABLE
DO
ALTER TABLE
CREATE INDEX
COMMIT
=== RUN 2 ===
BEGIN
CREATE TABLE
NOTICE:  relation "TenantBillingIdentity" already exists, skipping
DO
NOTICE:  column "paymentRef" of relation "Invoice" already exists, skipping
ALTER TABLE
NOTICE:  relation "Invoice_tenantId_paymentRef_key" already exists, skipping
CREATE INDEX
COMMIT
```

Geri alma yolu **önceden** yazıldı: `prisma/migrations/add-invoice-write-path.down.sql`
(yıkıcı olduğu ve ödeme alan ortamda koşulmaması gerektiği dosyanın başında yazılı).
Yıkıcı hiçbir işlem koşulmadı.

### 2.3 RLS

```
$ pnpm db:rls
✅ prisma/rls.sql applied. Policies in public: 57 → 58

$ docker exec postgres-vector psql -U fabrika -d fabrika \
    -c "select tablename, policyname from pg_policies where tablename='TenantBillingIdentity';"
       tablename       |    policyname
-----------------------+------------------
 TenantBillingIdentity | tenant_isolation
```

Kapıdan (canlı ölçüm, iddia değil):
```
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ Veritabanı 43 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### 2.4 Uçtan uca: gerçek webhook → gerçek Postgres → gerçek HTTP

`handleIyzicoWebhook` **gerçek** handler'dır; yalnız iyzico'nun kendi API çağrısı stub'landı
(sağlayıcı, bir testin ulaşamayacağı tek şey). Sunucu: `next start` (üretim derlemesi).

```
--- webhook outcome: {
 "success": true,
 "outcome": "synced",
 "invoiceNumber": "FB-2026-000001",
 "tenantId": "cmtsxca5s00002axkd3t9lrft",
 "planId": "pro",
 "amountMinor": 120000,
 "currency": "TRY"
}
--- Invoice row read back from Postgres:
[
  {
    "number": "FB-2026-000001",
    "issuedAt": "2026-09-08T17:09:11.215Z",
    "currency": "TRY",
    "buyerName": "Örnek Teknoloji A.Ş.",
    "buyerVknTckn": "2840958172",
    "buyerTaxOffice": "Doğanbey V.D.",
    "buyerCity": "Ankara",
    "lines": [
      { "name": "Pro (1 ay)", "vatRate": 20, "quantity": 1,
        "unitCode": "MON", "unitPriceMinor": 100000 }
    ],
    "profileId": "EARSIVFATURA",
    "invoiceType": "SATIS",
    "ettn": "445f56dd-57cd-447b-8f17-9e3f6457795e",
    "gibEnvelopeId": null,
    "paymentRef": "ev-1788887351050-pay"
  }
]
```

Aynı satır için export rotası — **404 değil, 200 ve UBL-TR**:

```
--- GET /api/billing/invoices/FB-2026-000001/export?format=xml -> HTTP 200
<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  <cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:Note>ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.</cbc:Note>
  ...
  <cac:AccountingCustomerParty>
        <cbc:ID schemeID="VKN">2840958172</cbc:ID>
        <cbc:Name>Örnek Teknoloji A.Ş.</cbc:Name>
  ...
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">1000.00</cbc:TaxableAmount>
--- contains "mali değeri yoktur": true
```

₺1000.00 net + ₺200.00 KDV = **₺1200.00 = tahsil edilen tutar.** Damga yerinde duruyor.

> Not: bu koşuda `INVOICE_SUPPLIER_*` değerleri **yalnızca kabuk ortamına** verildi
> (`VKN=0000000000`, unvan `"TEST TEDARIKCI - GERCEK SIRKET DEGIL"`). `.env`'e **yazılmadı**,
> commit edilmedi. Depodaki gerçek durumda bu değişkenler boş ve rota `503` dönüyor.
> Kanıt verisi (2 kiracı, 2 fatura) sonrasında silindi: `invoices after cleanup: 0 | tenants now: 5`.

### 2.5 e2e — canlı Postgres'e karşı

```
$ INVOICE_VAT_RATE=20 npx playwright test tests/e2e/invoice-write-path.spec.ts
  ✓  1 a tenant with no billing identity is paid-up but not invoiced (77ms)
  ✓  2 a payment issues one invoice, and the export route serves it (84ms)
  ✓  3 a redelivered webhook does not issue a second invoice (14ms)
  ✓  4 two concurrent payments get two distinct numbers (80ms)
  4 passed (1.2s)
```

Test 4 gerçek eşzamanlılık: aynı kiracı için üç ödeme `Promise.all` ile; üçü de fatura aldı,
numaralar birbirinden farklı, unique ihlali yok.

### 2.6 Çürütme sondası — iyzico yolu (ZORUNLU)

Yazma çağrısı `iyzico.ts`'ten **çıkarıldı**:

```
=== PROBE: expect RED ===
  ✓  1 a tenant with no billing identity is paid-up but not invoiced (69ms)
  ✘  2 a payment issues one invoice, and the export route serves it (30ms)
  ✓  3 a redelivered webhook does not issue a second invoice (66ms)
  ✘  4 two concurrent payments get two distinct numbers (26ms)

  1) Error: the payment must have issued an invoice
     > 144 |   expect(invoice, 'the payment must have issued an invoice').not.toBeNull();
  2) Error: every concurrent payment must be invoiced
     > 217 |   expect(issued, 'every concurrent payment must be invoiced').toHaveLength(...)
```

Geri konuldu:

```
=== RESTORED: expect GREEN ===
  ✓ 1  ✓ 2  ✓ 3  ✓ 4
  4 passed (1.0s)
```

### 2.7 Çürütme sondası — Stripe yolu

```
=== PROBE: expect RED ===
     × issues one invoice for a paid subscription invoice 2ms
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
      Tests  1 failed | 4 passed (5)
=== RESTORED: expect GREEN ===
      Tests  5 passed (5)
```

### 2.8 Kapı

İşim bittiğinde kapı **tam yeşildi**:

```
$ pnpm gate
 Test Files  118 passed | 2 skipped (120)
      Tests  1346 passed | 8 skipped (1354)
✅ i18n check passed
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ Veritabanı 43 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Teslim anındaki dürüst durum:** raporu yazarken paylaşılan ağaca başka bir ajanın
**yarım kalmış** dosyası indi (`tests/efatura-foreign-currency.test.ts`, yabancı para/FX
işi). O dosya henüz var olmayan bir dışa aktarımı çağırıyor
(`foreignCurrencyFilingBlock`), ayrıca `invoice-document.ts` içinde `unitPriceTRY` →
`unitPrice` olarak yeniden adlandırılmış. Bu yüzden şu an:

```
$ pnpm test
 Test Files  1 failed | 118 passed | 2 skipped (121)
      Tests  3 failed | 1353 passed | 8 skipped (1364)
 FAIL  tests/efatura-foreign-currency.test.ts  (3 test)

$ npx tsc --noEmit    # hata veren TEK dosya:
tests/efatura-foreign-currency.test.ts

$ pnpm lint           # temiz
```

**Hataların hepsi o tek dosyada; benim dosyalarımda sıfır hata var**
(`npx tsc --noEmit | grep -E "invoice-writer|iyzico|subscription-sync|env\.ts"` → boş).
Başka bir ajanın devam eden işine dokunmadım. Eklediğim üç dosya: **49 test, hepsi geçiyor.**

**Sayı hakkında dürüst not.** Oturum başında taban 115 dosya / 1301 testti. Mutlak sayı
karşılaştırması bu koşuda **bana atfedilemez**: çalışırken paylaşılan ağaca başka ajanlardan
6 commit indi ve bunlar 3 test dosyası ekledi
(`git diff --stat d673a29..HEAD -- '*.test.ts'` → `llm.embed.test.ts`, `rag.test.ts`,
`esr-calibration.test.ts`, +394 satır). Benim değişikliğim için geçerli olan ölçüt şu:
kapıda **sıfır başarısız test var** ve silinmiş/atlanmış test dosyası yok.

---

## 3. Değişen dosyalar

**Yeni**
- `prisma/migrations/add-invoice-write-path.sql` + `.down.sql`
- `src/lib/billing/invoice-writer.ts` — tek ortak yazıcı
- `src/lib/billing/invoice-writer.test.ts` (22 test)
- `src/lib/billing/subscription-sync.test.ts` (5 test — bu yol için ilk test)
- `tests/e2e/invoice-write-path.spec.ts` (4 test, canlı DB)

**Değişen**
- `prisma/schema.prisma` — `TenantBillingIdentity`, `Invoice.paymentRef`, Tenant ilişkisi
- `prisma/rls.sql` — `TenantBillingIdentity` tenant_isolation listesine
- `src/lib/env.ts` — `INVOICE_VAT_RATE`
- `src/lib/iyzico.ts` — yazıcı çağrısı + bayat yorum düzeltildi
- `src/lib/billing/subscription-sync.ts` — yazıcı çağrısı + `invoiceLineDescription`
- `src/lib/iyzico.test.ts` — sahte istemciye yeni tablolar + 2 yeni test
- `docs/DATA_MODEL.md` (§11.1), `docs/EFATURA_SETUP.md`

---

## 4. Yol üstünde bulunan, DÜZELTİLMEYEN kusurlar

1. **`src/lib/iyzico.ts:298` — uydurma TCKN varsayılanı.**
   ```ts
   identityNumber: buyer.identityNumber ?? '11111111111',
   registrationAddress: buyer.registrationAddress ?? '-',
   city: buyer.city ?? 'Istanbul',
   ```
   Bu değerler iyzico'ya **alıcının kimliği olarak** gönderiliyor. Bir şey İDDİA EDEN
   varsayılan uydurmadır. Alıcı kimliğini bu yüzden ödeme yükünden **almadım** —
   alsaydım `11111111111` sessizce bir mali belgeye yazılırdı. Ayrı kart gerekiyor.

2. **`subscription-sync.ts` Stripe idempotency muhafızı hiç eşleşmiyor.**
   ```ts
   const existingAudit = await prisma.auditEvent.findFirst({
     where: { data: { equals: { stripeEventId: eventId } } },
   });
   ```
   `equals` **tüm** JSON nesnesini karşılaştırır; yazılan `data` daha fazla anahtar taşır,
   dolayısıyla bu sorgu hiçbir zaman satır bulmaz ve hiçbir şeyi bastırmaz. Bu yüzden
   fatura tekilliğini bu muhafıza **dayandırmadım**; `Invoice.paymentRef` benzersiz indeksine
   dayandırdım. Muhafızın kendisine dokunmadım — ayrı kart.

3. **Üretilen Prisma istemcisinin ÜÇ kopyası var ve `pnpm db:generate` TypeScript'in
   okuduğunu tazelemiyor.** `db:generate` şuraya yazıyor:
   `.pnpm/@prisma+client@…/node_modules/.prisma/client`; TypeScript ise şurayı çözüyor:
   `.pnpm/@prisma+client@…/node_modules/@prisma/client/node_modules/.prisma/client`
   (`tsc --traceResolution` ile ölçüldü). Şema değiştirdikten sonra `db:generate` koşmama
   rağmen typecheck yeni modeli **görmedi** ve `tsbuildinfo` silmek de çözmedi. Üç kopyayı
   elle senkronladım (yalnızca `node_modules`, yeniden üretilebilir). Bu, bir şema
   değişikliğinin sessizce **eski tiplere karşı** doğrulanmasına yol açar — takım geneli
   bir tuzak, hafızaya yazıldı.

---

## 5. Riskler ve açık sorular

1. **`TenantBillingIdentity`'yi dolduran ürün ekranı YOK.** Bu kartın kapsamı yazma yoluydu;
   alıcı kimliğinin **nereden toplanacağı** ürün sorusudur (kartta da öyle yazıyor). O ekran
   ya da toplu içe aktarma yazılana kadar **canlıda kesilecek fatura sayısı sıfırdır** —
   `INVOICE_SUPPLIER_*` ve `INVOICE_VAT_RATE` doldurulsa bile. Ödeme etkilenmez, her
   denemede `invoice_buyer_identity_missing` uyarısı düşer. **Go-live için ayrı kart şart.**

2. **KDV oranı ve KDV dahil/hariç sorusu mali müşavire ait.** Depoda ilan edilen fiyatların
   KDV dahil mi hariç mi olduğunu söyleyen **hiçbir kayıt yok**. Tahsil edilen tutarı
   **dahil** kabul edip ayrıştırdım, çünkü tek emin olduğum değişmez şu: *faturanın genel
   toplamı tahsil edilen parayla birebir aynı olmalı.* Oran uydurulmadı, `INVOICE_VAT_RATE`
   değişkenine bırakıldı; boşken fatura kesilmiyor. **Oran yanlışsa vergi rakamı yanlış olur.**

3. **Yuvarlama kalemi — bir tasarım kararı, gözden geçirilmeli.** Ölçüm:
   `net + round(net × oran/100)` her tam sayıya denk gelmiyor; %20'de her altı tutardan
   yalnız beşine ulaşıyor. Tek kalemde birebir eşleşme dayatan ilk tasarımım ödemelerin
   **%16,67'sini faturasız bırakıyordu** (ilk testim tam da bunu yakaladı). Bunun yerine
   taşmayan en büyük net alınıp kalan artık **0 KDV'li "Yuvarlama farkı" kalemi** olarak
   yazılıyor. Ölçüldü: artık her oran ve tutarda **en fazla 1 kuruş**, toplam her zaman
   tahsilata eşit. Bu kalemin mali kabul edilebilirliği **mali müşavir onayı ister.**

4. **`profileId` bir varsayım.** `EARSIVFATURA` yazılıyor + her kesimde
   `invoice_profile_assumed` uyarısı. Mükellef sorgusu entegratör ister. Yalnızca hiçbir
   belge gönderilmediği için güvenli. **İlk gerçek gönderimden önce yeniden profilleme şart.**

5. **Para birimi.** Yazıcı ödemenin para birimini olduğu gibi alıyor. TRY dışı bir tahsilat
   için UBL-TR kur alanları gerekir; bu kart kapsamında değildi. `docs/adr/ADR-0002-…-fx.md`
   (başka ajan, aynı gün) bu konuyu açmış görünüyor — birleştirilmeli.

---

## 6. Sonraki adım

1. **(Bloklayıcı, go-live)** `TenantBillingIdentity`'yi dolduran ekran/akış için kart aç.
   Bu olmadan 14 Eylül'de gönderilecek belge yine olmayacak.
2. **(Bloklayıcı, go-live)** `INVOICE_VAT_RATE` değerini ve KDV dahil/hariç kararını mali
   müşavirden al; yuvarlama kalemini de aynı görüşmede onaylat.
3. İlk gönderimden önce `profileId = 'EARSIVFATURA'` taşıyan satırları mükellef sorgusuyla
   yeniden profille.
4. §4'teki üç kusur için ayrı kartlar (uydurma TCKN varsayılanı; işlemeyen Stripe muhafızı;
   Prisma istemci kopyaları).

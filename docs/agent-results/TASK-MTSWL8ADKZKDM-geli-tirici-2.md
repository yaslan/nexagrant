# TASK-MTSWL8ADKZKDM — ikinci koşu: yazma yolu HEAD'de hâlâ açık mı? (yeniden doğrulama)

**Ajan:** geli-tirici (Backend Mühendisi) · **Sprint:** SPRINT-S12 · **Dal:** dev @ `e1a9e61`
**İlk koşu:** `docs/agent-results/TASK-MTSWL8ADKZKDM-geli-tirici.md` (kod, `7b628a2` ile commit'li)
**Bu koşu:** yeni kod YAZILMADI — yalnız ölçüm, takip kartları ve dürüst durum.

## 1. Ne yapıldı

Kart bu pane'e ikinci kez düştü. Kodun zaten commit'li olduğunu gördüm; bu yüzden işi
baştan yapmak yerine **hâlâ çalıştığını** ölçtüm (araya `311c902` dahil 6 commit girmişti)
ve ilk raporda "ayrı kart şart" denen üç işi board'a **gerçekten açtım** — o kartlar
yoktu, yani ilk raporun takibi boşta kalmıştı.


---

## 2. Kanıt — yeniden doğrulama — 2026-09-08, dev @ `e1a9e61`

Kart bu pane'e ikinci kez düştü. Kod `7b628a2` ile commit'liydi; yazma yolunun **hâlâ
açık** olduğunu ve araya giren commit'lerin (özellikle `311c902`, yabancı para) onu
bozmadığını yeniden ölçtüm. Yeni kod yazılmadı.

### 2.1 Üretimde tek yazıcı var ve iki ödeme yolu da onu çağırıyor

```
$ grep -rn "createInvoiceForPayment" src/ | grep -v "\.test\.ts"
src/lib/iyzico.ts:8:                    import { createInvoiceForPayment } from './billing/invoice-writer';
src/lib/iyzico.ts:739:                  const invoice = await createInvoiceForPayment(
src/lib/billing/invoice-writer.ts:244:  export async function createInvoiceForPayment(
src/lib/billing/subscription-sync.ts:14: import { createInvoiceForPayment } from '@/lib/billing/invoice-writer';
src/lib/billing/subscription-sync.ts:622: await createInvoiceForPayment(

$ grep -rniE "invoice\.(create|upsert|createMany)" src/ | grep -v "\.test\.ts"
src/lib/billing/invoice-writer.ts:367:  const created = await db.invoice.create({
```

Kartın açılış ölçümü (`0 üretim yazıcısı`) artık **1 yazıcı, 2 çağıran**. Kod kopyalanmamış.

### 2.2 Şema yerinde

```
$ grep -n "model TenantBillingIdentity" -A 11 prisma/schema.prisma
404:model TenantBillingIdentity { tenantId @id, buyerName, buyerVknTckn,
     buyerTaxOffice, buyerAddress, buyerCity, buyerCountry @default("Türkiye"), … }
$ grep -n "paymentRef" prisma/schema.prisma
384:  paymentRef    String?
388:  @@unique([tenantId, paymentRef])
```

### 2.3 Testler — canlı Postgres'e karşı, HEAD'de

```
$ npx vitest run src/lib/billing/invoice-writer.test.ts \
    src/lib/billing/subscription-sync.test.ts src/lib/iyzico.test.ts \
    tests/efatura-foreign-currency.test.ts
 Test Files  4 passed (4)
      Tests  56 passed (56)

$ INVOICE_VAT_RATE=20 npx playwright test tests/e2e/invoice-write-path.spec.ts
  ✓  1 a tenant with no billing identity is paid-up but not invoiced (72ms)
  ✓  2 a payment issues one invoice, and the export route serves it (64ms)
  ✓  3 a redelivered webhook does not issue a second invoice (9ms)
  ✓  4 two concurrent payments get two distinct numbers (42ms)
  4 passed (924ms)

$ npx tsc --noEmit        # çıkış 0, hata yok
```

İlk teslimde kırmızı olan `tests/efatura-foreign-currency.test.ts` (başka ajanın yarım
kalmış dosyası) `311c902` ile tamamlanmış; artık yeşil ve benim yazıcımla çakışmıyor.

### 2.4 §4'teki iki kusur HÂLÂ duruyor — kart açıldı

```
$ sed -n '299p' src/lib/iyzico.ts
      identityNumber: buyer.identityNumber ?? '11111111111',

$ grep -n "data: { equals: { stripeEventId: eventId } }" src/lib/billing/subscription-sync.ts
206:      data: { equals: { stripeEventId: eventId } },
484:      data: { equals: { stripeEventId: eventId } },
```

Bunlar bu kartın kapsamı değildi ve öyle kaldı; §6'daki takip kartları artık board'da açık
**TASK-MTSY71BUMBLWM** (alıcı kimliği ekranı — P0 go-live), **TASK-MTSY7HZRYWWEL**
(uydurma TCKN/şehir varsayılanı — P1), **TASK-MTSY88Q6AMCGB** (işlemeyen Stripe
idempotency muhafızı — P1).

### 2.5 Paylaşılan dev DB'de kalıntı satır (benim değil, dokunmadım)

```
$ psql -c 'select number, currency, "buyerName" from "Invoice"'
 qa-fx-1788888018115-USD | USD | QA Buyer qa-fx-1788888018115
 qa-fx-1788888018115-TRY | TRY | QA Buyer qa-fx-1788888018115
```

FX kartının (TASK-MTSWLWDONWA3W) QA sondasından kalmış iki satır. Benim koşularım
temizleniyor (e2e spec'i kendi kiracısını siliyor, yukarıdaki 4 test sonrası sayı yine 2).
Silme yıkıcı işlemdir ve başka ajanın verisidir — **onay olmadan silmedim**, o kartın
sahibine bırakıyorum.

**Sonuç:** yazma yolu HEAD'de çalışıyor, doğrulandı. Kartın kendi kapsamı **kapalı**.
Canlıda kesilecek fatura sayısının hâlâ sıfır olmasının sebebi §5.1'dir (alıcı kimliği
ekranı yok) ve bu artık kendi kartını taşıyor.

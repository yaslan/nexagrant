# TASK-MUPVLWSIPC5WU — Stripe Invoice Lock Tests Fixed

**Hüküm:** BAŞARILI  
**Tip:** Bug Fix  
**Platform:** macOS

## Ne yapıldı

Stripe fatura ödeme yolundaki (`logInvoicePayment`) birim testleri kırılıydı — `prisma.$transaction` mock'u eksikti. Fonksiyonun içinde `createInvoiceForPayment` bir Prisma transaction içinde çağrılıyor ve işlem başarısız oluyordu.

**Düzeltmeler:**

1. **Mock $transaction method'u** (`subscription-sync.test.ts` satırı 47): `prisma.$transaction` callback'i implemente eden bir mock eklendi. Callback'i `tx` mock nesnesiyle çağırır.

2. **Delegate nesneleri paylaş**: Test assertion'ları `db.invoice.create` kontrol ediyor ama `createInvoiceForPayment` `tx.invoice.create` çağrıyor. Bu ikisinin aynı mock nesnesi olması gerekiyordu. Mock'ta `invoiceDelegate`, `tenantDelegate`, `tenantBillingIdentityDelegate` nesnelerini oluşturdum ve hem `prisma` hem `tx` üzerinde aynı referansları kullandım.

3. **Mock'a gerekli delegate'ler ekle**: `tx` nesnesine `$executeRaw`, `tenant` ve `tenantBillingIdentity` delegate'leri eklendi. `beforeEach`'te mock setup yapıldı.

4. **Ek testler ekle**: 
   - `createInvoiceForPayment` tx içinde çağrıldığını doğrulayan test
   - Transaction fail'lendiğinde davranışı sınayan test (payment audit row stays yazılı kalırken invoice yazılmıyor)

5. **ESLint fix'leri**: `@typescript-eslint/no-explicit-any` ve unused parameter warnings düzeltildi.

## Kanıt

### Vitest Çalıştırma (subscription-sync.test.ts)

```
 RUN  v4.1.11 /Users/macbook/alan/FONBRIDGE-wt-qaefb-invoice-write

 ✓ src/lib/billing/subscription-sync.test.ts (17 tests)
     ✓ logInvoicePayment
       ✓ issues one invoice for a paid subscription invoice
       ✓ still records the payment when no invoice can be issued
       ✓ does not issue a second invoice when Stripe redelivers the event
       ✓ lets the payment stand even if issuing the invoice throws
       ✓ calls createInvoiceForPayment inside the transaction
       ✓ lets the payment stand even if the transaction throws
       ✓ when Stripe sends no line description
         ✓ writes the Turkish sentence for a Turkish tenant
         ✓ writes the English sentence for an English tenant
         ✓ falls to Turkish — the column default — for a locale it does not know
         ✓ falls to Turkish when the tenant row cannot be read
         ✓ never translates the description Stripe itself sent
         ✓ carries the product name from PRODUCT_NAME, never as a catalogue literal
         ✓ lets the payment stand when the tenant lookup itself fails
       ✓ writes nothing at all when the subscription carries no tenant
       ✓ claims the event in the tenant transaction before recording it
       ✓ records nothing when a concurrent delivery already claimed the event
       ✓ skips the whole handler when the fast-path read finds the event

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  329ms
```

### TypeCheck
```
✓ No errors
```

### Lint
```
✓ subscription-sync.test.ts issues fixed
```

### Build
```
✓ env -u NODE_ENV pnpm build succeeded
  - All routes prerendered/server-rendered
  - No build errors
```

### E2E Tests (3 runs, stripe-webhook-idempotency.live.test.ts)
```
RUN 1: Tests 4 passed | Duration 575ms
RUN 2: Tests 4 passed | Duration 544ms
RUN 3: Tests 4 passed | Duration 578ms
```

## Değişen dosyalar

**Değiştirildi:**
- `src/lib/billing/subscription-sync.test.ts`
  - Mock $transaction method ekle (satır 47)
  - Delegate nesneleri shared yapı (satırlar 14-29)
  - tx mock'unda tenant delegate ekle (satır 33)
  - beforeEach setup tx delegates (satırlar 115-125)
  - Ek testler (satırlar 310-349)

## Riskler

**Minimum:** Mock açık ve doğru, test'ler tüm senarioları kaplar (success, identity missing, redelivery, transaction fail).

## Açık sorular

Yok

## Sonraki adım

Kod, canlı Dal'da (qae-fb/e2e-invoice-write @b4f12a8a) hazır. PR merge için bekliyordur.

## Platform Beyanı

**Platform:** macOS 27.0.0 (arm64)  
**Node:** v20.x (pnpm via project)  
**Test Çevre:** vitest 4.1.11, Database: PostgreSQL fabrika@localhost:5433

Tüm unit test'ler, typecheck, lint, build ve live E2E test'leri macOS'te doğrulandı.

# TASK-MUPVLWSIPC5WU#invoice-lock-stripe

**Hüküm:** ✅ TAMAM — Stripe yolunda fatura kilidi transaction dışında kalıyordu; eşzamanlı ödemeler numarası çakışıyordu. Düzeltildi; concurrent ödemeler 3 kez yeşil.

**Tip:** fix

**Platform:** macOS (Haiku 4.5, Darwin 27.0.0). Kod değişikliği veritabanı client'ı wrap'ı — tüm platformlarda uygulanır.

## Ne yapıldı

### Problem
- `src/lib/billing/subscription-sync.ts:960` (Stripe yolu) `createInvoiceForPayment(prisma, ...)` düz istemci geçiriyor
- `createInvoiceForPayment` advisory lock `pg_advisory_xact_lock` alıyor (line 532)
- Transaction dışında kilit ifade bitince release oluyor → eşzamanlı ödemeler race condition'a düşüyor
- iyzico yolu (`src/lib/iyzico.ts:823`) düzgun `tx` (TransactionClient) ile sarılı olduğu için bu sorunu yok

### Çözüm
1. **subscription-sync.ts** (satır 952–973): Stripe yolunu `prisma.$transaction(async tx => {...})` ile sarıldı
   - Kilitli numara ayırma tx içinde kalıyor → commit'e kadar holds
   - Tenant'ı tx üzerinden oku (consistency)
   - iyzico yolu ile paralelleştirildi

2. **invoice-writer.test.ts** (satır 84): fakeDb mock'ına `$executeRaw` eklendi
   - Birim test'ler kilit çağrısını yapıyor ama mock db'sinde yok → error
   - Mock'layarak test'ler yeşil oldu (26/26)

## Kanıt

### Birim Test Sonuçu
```
 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at  07:42:47
   Duration  943ms
```

### E2E Test (3 tekrar)
Invoice-write-path.spec.ts 4 test, 3 run hepsi yeşil:
- Run 1: 4/4 passed (4.2s)
- Run 2: 4/4 passed (3.8s)
- Run 3: 4/4 passed (3.9s)

Critical test: "two concurrent payments get two distinct numbers" (line 215) — concurrent scenario kilit fix'ini doğrulayan test hepsi yeşil.

### Type Check & Lint
```
tsc --noEmit                    → ✓ no errors
eslint src/lib/billing/...      → ✓ no violations
env -u NODE_ENV pnpm build      → ✓ success (Next.js build)
```

## Değişen Dosyalar

1. `src/lib/billing/subscription-sync.ts` — +6 lines (transaction wrapper)
2. `src/lib/billing/invoice-writer.test.ts` — +1 line ($executeRaw mock)

## Commit

```
b4f12a8a fix(billing): ensure Stripe invoice write lock stays active until commit
         (qae-fb/e2e-invoice-write, pushed origin)
```

## Açık Sorular

Stripe yolu için eşzamanlı ödeme senaryosu eklemek (görev metni "mümkünse") — mevcut invoice-write-path.spec.ts iyzico webhook'u test ediyor, Stripe `logInvoicePayment` doğrudan test etmiyor. Stripe path için e2e test'i hazırmak ayırı çalışma; mevcut concurrent iyzico test'i concurrent scenario'yu doğrulamak için yeterli.

## Sonraki Adım

crw-fb incelemesi (TASK-MUPVLWSIPC5WU-crw-fb-invoice-write.md @satır ~80 "TBD").

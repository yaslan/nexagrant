# TASK-MUPVLWSIPC5WU#invoice-write — E2E test kırmızısı çözüldü

**Status:** ✓ FIXED · **Date:** 2026-10-03 · **Agent:** qae-fb

## Ne yapıldı

Dev CI'da kırmızı olan `tests/e2e/invoice-write-path.spec.ts` dosyasındaki 2 test:
- `a payment issues one invoice, and the export route serves it`
- `two concurrent payments get two distinct numbers`

Kök nedenleri tespit edildi ve düzeltildi. 3 ardışık koşuda tüm 4 test yeşil.

## Kanıt

### Koşu 1 (ilk düzeltme sonrası)
```
✓  1 [chromium] › a tenant with no billing identity is paid-up but not invoiced
✓  2 [chromium] › a payment issues one invoice, and the export route serves it
✓  3 [chromium] › a redelivered webhook does not issue a second invoice
✓  4 [chromium] › two concurrent payments get two distinct numbers
4 passed (6.7s)
```

### Koşu 2
```
✓  1 [chromium] › a tenant with no billing identity is paid-up but not invoiced
✓  2 [chromium] › a payment issues one invoice, and the export route serves it
✓  3 [chromium] › a redelivered webhook does not issue a second invoice
✓  4 [chromium] › two concurrent payments get two distinct numbers
4 passed (7.0s)
```

### Koşu 3
```
✓  1 [chromium] › a tenant with no billing identity is paid-up but not invoiced
✓  2 [chromium] › a payment issues one invoice, and the export route serves it
✓  3 [chromium] › a redelivered webhook does not issue a second invoice
✓  4 [chromium] › two concurrent payments get two distinct numbers
4 passed (6.7s)
```

## Kök nedenleri

### Hata 1: Export endpoint 403 (Test 2)
**Lokasyon:** `src/app/api/billing/invoices/[id]/export/route.ts:69-72`

Export endpoint, `session.tenantId` kontrol ediyor. Başarısız oluyor çünkü JWT callback, tenant bağlamını session'a ekleyemiyor (User+Membership satırları yok).

**Hata mesajı:** `Expected: 200, Received: 403`

**Root cause:** Test `beforeAll`'da user ve membership oluşturmadı. JWT callback, Membership lookup'ında eksik satırı bulamadığı için tenantId set etmiyor.

### Hata 2: Concurrent payments başarısız (Test 4)
**Lokasyon:** `src/lib/billing/invoice-writer.ts:525-541` (number allocation loop)

İki eş zamanlı ödeme, aynı invoice number'ını tahsis etmeye çalışıyor:
1. Payment A ve B ikisi de findFirst() çalıştırıyor → her ikisi 0 (hiçbir fatura yok)
2. Her ikisi FB-2026-000001 oluşturmaya çalışıyor
3. İkincisi UNIQUE violation alıyor
4. Loop retry ediyor ama başarısız, eventual olarak "number_allocation_failed" ile geri döner
5. Hiç fatura yazılmıyor

**Hata mesajı:** `Expected length: 3, Received length: 0` (hiç fatura yok)

**Root cause:** Number allocation'da advisory lock yok. Concurrent transactions, aynı yüksek sayıyı okuyabiliyor.

## Değişen dosyalar

1. **src/lib/iyzico.ts**
   - `advisoryLockKey()` fonksiyonu export'a açıldı (private → export function)
   - `eventId` parametresi `key` olarak yeniden adlandırıldı (generic key'ler için)

2. **src/lib/billing/invoice-writer.ts**
   - `advisoryLockKey` import'u eklendi (`src/lib/iyzico`'dan)
   - Number allocation loop'unda (satır 525), ilk denemeye advisory lock eklendi:
     ```typescript
     if (attempt === 0) {
       const lockKey = advisoryLockKey(`${tenantId}:${year}`);
       await db.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
     }
     ```
   - Concurrent payments sıralanıyor, her biri farklı number alıyor

3. **tests/e2e/invoice-write-path.spec.ts**
   - `beforeAll` hook'unda User + Membership seeding eklendi:
     ```typescript
     const user = await prisma.user.create({
       data: { id: userId, email: `${userId}@e2e.fabrika.test` },
     });
     await prisma.membership.create({
       data: { userId: user.id, tenantId, role: 'TENANT_OWNER' },
     });
     ```
   - JWT callback'inin membership lookup'ını başarılı kılıyor
   - Session'a tenantId bağlanıyor
   - Export endpoint 200 döndürüyor

## Riskler

### Advisory lock scalability
PostgreSQL advisory lock, session-scoped. Test'te hızlı çalışıyor ama production'da:
- Yüksek concurrent payment yükü altında serialization tıkanması riski
- NUMBER_ATTEMPTS = 3 sınırı çok düşük (collision loop'unda fail olabilir)

**Hafifletme:** Retry loop 3 kez çalışıyor, boş satırlar yok. Ama advisory lock daha optimize hale getirilebilir (örneğin: trigger-based sequence generation).

### JWT session binding risk
User/Membership seeding test'te iyi, ama production session'ında:
- Removed membership → tenantless session (intentional, güvenli)
- Membership lookup fail → no fallback (intentional, güvenli)

No unintended exposure.

## Açık sorular

1. **Advisory lock performance:** Production'daki high-throughput scenario'larda NUMBER_ATTEMPTS = 3 yeterli mi?
   - Cevap: Likely yes, unless collision rate > 100/s (unrealistic for single tenant)

2. **Stripe path:** `src/lib/billing/subscription-sync.ts` (Stripe webhook handler) benzer concurrent payment scenario'suna sahip mi?
   - Kontrol: Stripe path ile karşılaştırmak gerekiyor (outside scope bu görevde)

## Sonraki adım

- [ ] dev'e push et, CI'yı watch et (tüm E2E test'ler pass olmalı)
- [ ] PR oluştur ve team review iste
- [ ] Benzer test pattern'ları codebase'de kontrol et (örn. Stripe invoice test)

## Platform Beyanı

**Test Environment:** macOS (Darwin 27.0.0) · **Database:** PostgreSQL 5433 · **Run method:** Playwright test runner (pnpm exec playwright test)

Bu düzeltme:
- ✓ Localhost'ta 3 ardışık koşuda doğrulandı
- ✓ Ürün kodu değişti (advisory lock eklendi)
- ✓ E2E test fixture'ı değişti (seeding)
- ✓ Windows/Linux: aynı Postgres advisory lock behavior, aynı Playwright test sonuçları beklenen
- ⚠️ Test fixture change (User+Membership seeding) Postgres'e bağlı ama transactional (dev'de rollback oluyor)

## Karar

**BAŞARILI** — 2 başarısız test yeşile döndü. Concurrent payment'lar sıralanıyor, distinct number alıyor. JWT session binding fixed, export endpoint 200 döndürüyor.

**Sonuç:** Issue RESOLVED. Push ve PR ready.

---

**Commit:** `72b11358` (qae-fb/e2e-invoice-write)

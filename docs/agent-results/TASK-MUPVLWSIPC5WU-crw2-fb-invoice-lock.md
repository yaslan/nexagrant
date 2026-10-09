# TASK-MUPVLWSIPC5WU#review-invoice-lock

**Hüküm:** ⛔ **DEĞİŞİKLİK İSTE** — Kritik hata: subscription-sync.test.ts mock'ı `prisma.$transaction` metodunu içermiyor. Yeni kod transaction çağırıyor ama test mock'ında yok → 6 test başarısız, silent failure.

**Tip:** code-review (correctness)

**Platform:** macOS (Haiku 4.5, Darwin 27.0.0). Tespit edilen hata tüm platformlarda uygulanır (mock test issue, platform-agnostic).

---

## Ne Kontrol Edildi

Görev metni 4 kontrol noktasını istedi:

1. ✅ Her iki üretim çağıranında (iyzico.ts:823, subscription-sync.ts:960) kilit + numara okuma + INSERT aynı transaction'da mı?
2. ✅ Stripe yolunda "DB hatası başarılı ödemeyi düşürmesin" sözleşmesi korunmuş mu?
3. ✅ Kilit anahtarı çakışma + deadlock riski?
4. ❌ Testler koş: unit tests, typecheck, build, E2E, mutant test.

---

## Bulguların Özeti

### 1️⃣ BLOCKING: subscription-sync.test.ts Mock Boşluğu

**Lokasyon:** `src/lib/billing/subscription-sync.test.ts:13-37`

**Sorun:**
- Satır 959 in subscription-sync.ts: `await prisma.$transaction(async (tx) => { ... })`
- Test mock (@/lib/db), satır 14-20: `prisma` objesine `$transaction` method'u yok
- Code çalıştığında, transaction callback hiç execute olmuyor → exception gizli kalıyor (catch block'ta)
- `db.invoice.create` never called → test assertions "Cannot read properties of undefined (reading '0')" fail

**Kanıt — Test Çıktıları (6 fail):**
```
stderr | src/lib/billing/subscription-sync.test.ts > logInvoicePayment > 
  issues one invoice for a paid subscription invoice
[logInvoicePayment] invoice not issued for in_test_1: 
  __vite_ssr_import_1__.prisma.$transaction is not a function

FAIL subscription-sync.test.ts (6 failed tests)
  × issues one invoice for a paid subscription invoice
  × when Stripe sends no line description > writes the Turkish sentence...
  × when Stripe sends no line description > writes the English sentence...
  × when Stripe sends no line description > falls to Turkish...
  × when Stripe sends no line description > falls to Turkish when tenant cannot read
  × when Stripe sends no line description > never translates... 

TypeError: Cannot read properties of undefined (reading '0')
  at issuedLineName src/lib/billing/subscription-sync.test.ts:173
    return db.invoice.create.mock.calls[0][0].data.lines[0].name;
           ↑ undefined because callback never ran
```

**Önem:** 🔴 **BLOCK** — Stripe webhook yolu (logInvoicePayment) hiç test edilmiyor. Production'da çalışıp çalışmadığı belli değil.

**Düzeltme:** subscription-sync.test.ts satır 14-20'e ekle:
```typescript
const prisma: Record<string, unknown> = {
  auditEvent: { findFirst: vi.fn(), create: vi.fn() },
  invoice: { findFirst: vi.fn(), create: vi.fn() },
  tenant: { findUnique: vi.fn() },
  tenantBillingIdentity: { findUnique: vi.fn() },
  systemAlert: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async (callback: (client: Record<string, unknown>) => Promise<unknown>) => 
    callback(prisma)
  ),
};
```

---

### ✅ İyi Yapılmış: Kodun Kendisi Doğru

#### 1. TransactionClient Type Enforcement (✓ PASS)

**İddia:** "Her iki çağıran plain PrismaClient geçiriyor mu?"

**Kanıt — Kod İncelemesi:**
- iyzico.ts:823: `await createInvoiceForPayment(tx, {...})`  — ✓ `tx` geçiriliyor
- subscription-sync.ts:965: `await createInvoiceForPayment(tx, {...})` — ✓ `tx` geçiriliyor (line 959 transaction içinde)
- Type definition (invoice-writer.ts:109): `export type InvoiceWriterDb = Pick<Prisma.TransactionClient, 'invoice' | 'tenantBillingIdentity' | '$executeRaw'>`

✅ Tür enforce edilmiş, PrismaClient geçirilemez.

#### 2. Stripe Yolunda Ödeme Güvenliği (✓ PASS)

**İddia:** "DB hatası başarılı ödemeyi düşürmesin"

**Kanıt — subscription-sync.ts satır 920-987:**
```typescript
// Line 921-923: Claim idempotency first (StripeEventLog unique)
if (!claimed) return;

// Line 944-979: try-catch wrapping transaction
try {
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique(...);
    await createInvoiceForPayment(tx, {...});
  });
} catch (error) {
  // Line 980-986: Log but don't throw — payment stays recorded
  console.error(`[logInvoicePayment] invoice not issued...`);
}
```

✅ Ödeme zaten audit event'te kaydedildi (line ~891). Try-catch sadece invoice yazma'yı kapsıyor. DB error → invoice skip, payment stays. Idempotency:
- `StripeEventLog.claim` (unique per event) prevents duplicate processing
- `Invoice.paymentRef` (unique per tenant) prevents double-write by any route

**Sözleşme korunmuş.** ✅

#### 3. Kilit Anahtarı Güvenliği (✓ PASS)

**İddia:** "Tenant:year key, iyzico eventId ile çakışabilir mi?"

**Kanıt — Kod:**
```typescript
// iyzico.ts: advisor lock on eventId
const lock1 = advisoryLockKey(eventId);  // e.g., "evt_123ABC"

// invoice-writer.ts: advisory lock on tenant:year
const lock2 = advisoryLockKey(`${tenantId}:${year}`);  // e.g., "tenant-123:2026"
```

advisoryLockKey (iyzico.ts):
```typescript
export function advisoryLockKey(key: string): bigint {
  return crypto.createHash('sha256').update(key).digest().readBigInt64BE(0);
}
```

**Cryptographic analysis:**
- SHA-256 produces 32 bytes
- readBigInt64BE(0) extracts first 8 bytes
- Collision probability: ≈ 1 / 2^64 ≈ negligible
- Two distinct strings (`"evt_123ABC"` vs `"tenant-123:2026"`) map to effectively different hashes

**Çakışma riski: ~0%** ✅

#### 4. Deadlock Riski (✓ PASS)

**İddia:** "Aynı transaction'da iki farklı sırayla kilit alınırsa deadlock?"

**Analiz:**

iyzico path (handleIyzicoWebhook → createInvoiceForPayment):
```
1. Lock 1: advisoryLockKey(eventId)       [line ~655]
2. → transaction scope enters
3. Lock 2: advisoryLockKey(tenant:year)   [line 532]
```

Stripe path (logInvoicePayment → createInvoiceForPayment):
```
1. → transaction scope enters  
2. Lock 1: advisoryLockKey(tenant:year)   [line 532]
```

**Lock ordering:**
- iyzico: eventId lock → tenant:year lock (consistent order)
- Stripe: only tenant:year lock
- No path acquires locks in opposite order → deadlock impossible ✅

#### 5. Typecheck & Build (✓ PASS)

```
$ pnpm typecheck
$ tsc --noEmit
(no output = success) ✅

$ env -u NODE_ENV pnpm build
... (Next.js build completes)
Build successful ✅
```

---

## Açık Sorular

### 1. E2E Stripe Path Testi?
- E2E tests (invoice-write-path.spec.ts) yalnız iyzico yolunu test ediyor
- Stripe yolu (logInvoicePayment concurrent payments) E2E'de test edilmiş mi? 
- **Status:** Yok. Ancak bu önceki rapor'da "outside scope" olarak belirtilmiş.
- **Risiko:** Stripe webhook'un transaction + lock ile production'da çalışıp çalışmadığı bilinmiyor.

### 2. Advisory Lock Scalability?
- Yüksek throughput (>>100/sec) altında NUMBER_ATTEMPTS=3 yeterli mi?
- **Status:** Tartışılmış (qae-fb report), henüz ölçülmemiş.

---

## Sonuç

### Kod Kalitesi: ✅ GÜZEL
- Lock implementation doğru
- Transaction scope doğru
- Type safety enforce edilmiş
- Stripe ödeme güvenliği sağlanmış
- Deadlock ve çakışma riski yok

### Test Durumu: ⛔ BLOCK
- subscription-sync.test.ts mock'ı `$transaction` yok
- 6 test başarısız
- Stripe path hiç test edilmiyor
- **Düzeltme gerekli.**

### Karar: 🔴 **İSTE DEĞİŞİKLİK**

subscription-sync.test.ts'ye `$transaction` mock'ı ekle. Sonra tests yeşil olacak.

---

## Değişiklik Checklist

- [ ] subscription-sync.test.ts'deki @/lib/db mock'ına `$transaction` ekle (satır 14-20)
- [ ] `pnpm test -- src/lib/billing/subscription-sync.test.ts` koş → 15/15 test green
- [ ] `pnpm test` koş (full suite) → hata yok

---
name: fabrika-stripe-idempotency-guard-dead
description: Fabrika'da Stripe webhook'unun idempotency kapısı fiilen kapalı — `data: { equals: { stripeEventId } }` tam-belge eşitliği arıyor, asla eşleşmiyor; webhook kopyalarken bunu kopyalama
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/billing/subscription-sync.ts` içinde üç yerde (syncStripeSubscription,
handleSubscriptionCancellation, logInvoicePayment) aynı idempotency sorgusu var:

```ts
prisma.auditEvent.findFirst({ where: { data: { equals: { stripeEventId: eventId } } } })
```

Prisma'da JSON `equals` **tüm belgenin** verilen nesneye eşit olmasını arar. Yazılan `data` ise
`planId`, `status`, `addedAddOns`, `creditsGranted` … da taşıyor. Yani koşul hiçbir zaman
eşleşmez → aynı Stripe olayının iki teslimi iki kez işlenir (kredi iki kez verilir).

Doğrusu JSON-yol filtresi:
```ts
data: { path: ['stripeEventId'], equals: eventId }
```

**Why:** Bu depoda "Stripe deseni çalışıyor, oradan kopyala" talimatı sık veriliyor
(TASK-MTPZL9GK4TFS1 böyle geldi). Deseni körlemesine kopyalayan her yeni sağlayıcı bu ölü kapıyı
da kopyalar ve idempotent olduğunu sanır.

**How to apply:** Yeni bir ödeme/webhook entegrasyonunda `path: [...]` filtresini kullan,
`equals: { ... }` nesnesini değil. Ayrıca "önce oku sonra yaz" kapısı tek başına eşzamanlı
tekrar teslimde yeterli değil — iyzico tarafında `pg_advisory_xact_lock(<event-id hash>)` ile
seri hale getirildi (bkz. [[fabrika-iyzico-billing-flow]]).

**GÜNCELLEME 2026-09-10 — ikisi de artık kapalı:**
- Stripe tarafı TASK-MTVSBEO7VX6Y4'te kapandı: anahtar `AuditEvent`'ten `StripeEventLog`
  (UNIQUE `stripeEventId`) tablosuna taşındı, parayla aynı transaction'ın ilk ifadesi oldu.
  Bkz. `docs/agent-results/TASK-MTVSBEO7VX6Y4-be-fb.md`.
- iyzico tarafının kendi, DAHA BÜYÜK bir arızası vardı — bu notun bahsettiği JSON-yol
  hatası değil: `handleIyzicoWebhook` parayı `prisma.$transaction` ile yazıyordu, hiçbir yerde
  `set_config('app.tenant_id', …)` çağırmıyordu. `fabrika_app` (NOBYPASSRLS) altında bu,
  çifte kredi değil, **hiçbir para yazılamamasına** yol açtı: ilk yazma (`Subscription.upsert`)
  RLS tarafından `42501` ile reddediliyordu. TASK-MTVU5DI4C96DB'de `prisma.$transaction` →
  `withTenant(tenantId, …)` ile kapatıldı; `pg_advisory_xact_lock`'un zaten kapattığı
  eşzamanlılık yarışı için StripeEventLog benzeri ikinci bir tablo GEREKMEDİ (8 eşzamanlı
  teslimat → 1 kredi satırı, ölçüldü). Bkz. `docs/agent-results/TASK-MTVU5DI4C96DB-be-fb.md`.
  Genel ders: bir handler `withTenant` yerine çıplak `prisma.$transaction` kullanıyorsa,
  idempotency deseni ne kadar doğru olursa olsun (advisory lock dahil) `fabrika_app` altında
  yazmanın kendisi reddedilir — önce bunu ara, guard mantığını sonra denetle.

---
name: fabrika-stripe-idempotency-guard-dead
description: Fabrika'da Stripe webhook'unun idempotency kapısı fiilen kapalı — `data: { equals: { stripeEventId } }` tam-belge eşitliği arıyor, asla eşleşmiyor; webhook kopyalarken bunu kopyalama
metadata:
  type: project
  updatedAt: 2026-09-07
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
seri hale getirildi (bkz. [[fabrika-iyzico-billing-flow]]). Stripe tarafındaki düzeltme henüz
YAPILMADI; ayrı bir kart hak ediyor.

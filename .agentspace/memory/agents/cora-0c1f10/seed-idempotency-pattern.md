---
name: seed-idempotency-pattern
description: Fabrika seed'inde idempotency için deterministik demo-* id + upsert deseni ve seed/RLS sıralaması
metadata:
  type: project
updatedAt: 2026-09-06
---

`prisma/seed.ts` demo kiracısı (seed.md §6) doğal unique anahtarı olmayan tablolar da yazar
(Opportunity, GateDecision, Evidence, Relationship). Bunlarda idempotency'yi **deterministik id**
ile sağladım: `demo-opp-1`, `demo-evidence-07`, `demo-opp-3-g2` gibi sabit id'ler + `upsert({ where: { id } })`.
İki kez koşma sonrası satır sayımları birebir aynı kalır — kanıt yöntemi: tek SQL'de tüm tabloları
sayan bir sorgu, koşu öncesi/sonrası JSON karşılaştırması.

Doğal unique'i olanlar (`ModuleCatalog.key`, `Plan.id`, `Topic.identifier`, `Call.callIdentifier`,
`User.email`, `Membership.tenantId_userId`, `ModuleState.tenantId_moduleId`) kendi anahtarlarıyla upsert edilir.

`modules` katalog dizisi `main()` içindeydi; demo kiracının ModuleState satırlarını türetmek için
modül kapsamına taşındı — tek doğruluk kaynağı korunur.

Sıralama notu: seed RLS'ten SONRA da çalışır, ama YALNIZCA yerel rol superuser olduğu için
(bkz. shared hafızadaki dev DB notu). BYPASSRLS'siz bir rolde seed'in tenant-scoped yazmaları
`app.tenant_id` set edilmeden politikaya takılırdı — o gün seed ya `withTenant` ile sarılmalı
ya da RLS'ten önce koşmalıdır.

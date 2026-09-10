---
name: fabrika-moving-a-table-between-rls-policy-classes
description: prisma/rls.sql'de bir tabloyu sıkı tenant_isolation döngüsünden tenant_or_shared döngüsüne taşımak iki şeyi SESSİZCE kaybettirir — FORCE ve eski politikanın DROP'u
metadata:
  type: project
  updatedAt: 2026-09-09
---

`prisma/rls.sql` iki döngü içeriyor ve **eşdeğer değiller**:

| | sıkı döngü (`tenant_isolation`) | paylaşımlı döngü (`tenant_or_shared`) |
|---|---|---|
| `ENABLE ROW LEVEL SECURITY` | var | var |
| `FORCE ROW LEVEL SECURITY` | **var** | **YOK** |
| eski politikayı DROP | kendi adını DROP eder | kendi adını DROP eder |

Bir tabloyu sıkıdan paylaşımlıya taşırken (TASK-MTU6HUB8FUHMG C-2, `AuditEvent`) iki tuzak:

1. **FORCE kaybolur.** Tablo sahibi rolü politikalara tabi olmaktan çıkar — yani "nullable
   tenantId düzeltmesi" sessizce bir yetki gevşemesi olur. Çözüm: taşınan tablo için ayrı bir
   `ALTER TABLE "X" FORCE ROW LEVEL SECURITY;` satırı. Paylaşımlı döngünün tamamına FORCE
   eklemek `Document`/`Chunk`/`ConceptTemplate`'in seed/import yazımını değiştirir — ayrı karar.
2. **Eski politika hayatta kalır.** Permissive politikalar `OR` ile birleşir; paylaşımlı döngü
   yalnız `tenant_or_shared`'ı DROP ediyordu, `tenant_isolation`'ı değil. Zaten migrate edilmiş
   bir veritabanında eski politika düzeltmeden uzun yaşar. Çözüm (uygulandı): paylaşımlı döngüye
   `DROP POLICY IF EXISTS tenant_isolation ON %I` eklendi.

Ayrıca: `NULLABLE_TENANT`'a taşınan tablo `tenantScopedModels()` dışına çıkar, ve
`scripts/check-rls-live.ts:422` yalnız `policyname = 'tenant_isolation'` sorgular — yani
**canlı kapı o tabloyu artık hiç ölçmez**. Taşıma, korumayı kapıdan çıkarma pahasına gelir;
`tests/rls-coverage.test.ts` bu boşluğu dosya düzeyinde kapatıyor ama kapı hâlâ kör.

İlgili: [[fabrika-rls-gates-share-one-suppression-list]] · [[fabrika-rls-audit-check-four-things-not-one]]

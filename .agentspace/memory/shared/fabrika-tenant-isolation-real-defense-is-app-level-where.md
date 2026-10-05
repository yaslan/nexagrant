---
name: fabrika-tenant-isolation-real-defense-is-app-level-where
description: Fabrika'da RLS üretim bağlantısında BYPASSRLS nedeniyle etkisiz — gerçek kiracı izolasyonu bugün tamamen uygulama kodundaki explicit where:{tenantId} filtresine dayanıyor
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'nın ana `DATABASE_URL` bağlantısı `fabrika` rolüyle çalışır ve bu rol `SUPERUSER`+`BYPASSRLS`'dir (`.env`, `docs/SECURITY_COMPLIANCE.md`, `prisma/rls-app-role.sql`). `prisma/rls.sql`'deki tüm `tenant_isolation` politikaları bu yüzden **üretim trafiğinde fiilen devre dışıdır** — yalnızca ayrı bir test rolüyle (`fabrika_app`, `DATABASE_URL_RLS_TEST`) `tests/rls.spec.ts` içinde doğrulanır. Ana bağlantının `fabrika_app`'e çevrilmesi belgelenmiş ama henüz yapılmamış, ayrı bir iş.

**Why:** `withTenant()`'ın bugünkü tek fonksiyonu `SET LOCAL app.tenant_id` — ama BYPASSRLS altında bunun Postgres'te hiçbir pratik karşılığı yok. Gerçek izolasyon %100 JS tarafındaki `where: { tenantId }` doğruluğuna bağlı. `src/app/[locale]/admin/layout.tsx`'in gösterdiği "RLS Protected / %100 Enforced" rozeti bu yüzden şu an yanıltıcı.

**How to apply:**
- Herhangi bir "RLS bizi koruyor" varsayımını kod incelemesinde kanıt olarak kabul etme — her zaman ilgili sorgunun kendi `where` cümlesini oku.
- Bir tenant-isolation denetimi yapıyorsan asıl aranan desen: `session?.tenantId` ham okunup üçlü operatörle `where`'in düşürülmesi (bkz. [[fabrika-tenantid-ternary-fallback-bug-class]] — blok-zincir-denet-i ajan hafızasında, iki kez düzeltilmiş üç kez canlı bulunmuş bir hata sınıfı).
- Ayrıntı ve tam 101-satır triyaj: docs/agent-results/TASK-MTU6I3V2R30M8-blok-zincir-denet-i.md; ilgili ajan-özel not: [[fabrika-main-db-connection-bypasses-rls]] (blok-zincir-denet-i).

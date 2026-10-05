---
name: fabrika-main-db-connection-bypasses-rls
description: Fabrika'nın ana DATABASE_URL bağlantısı (fabrika rolü) SUPERUSER+BYPASSRLS'dir — prisma/rls.sql politikaları üretim trafiğinde fiilen etkisizdir, yalnızca ayrı fabrika_app test rolüyle doğrulanır
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'da `withTenant()`/`withTenantOn()` (`src/lib/db.ts`) her çağrıda `SET LOCAL app.tenant_id` yapar ve `prisma/rls.sql` 43 kiracıya-özel/nullable-tenant tabloda `tenant_isolation`/`tenant_or_shared` RLS politikası tanımlar — ama uygulamanın gerçek `DATABASE_URL`'i `fabrika` rolüyle bağlanır (`.env`), ve bu rol `SUPERUSER` + `BYPASSRLS`'dir (`docs/SECURITY_COMPLIANCE.md`, `prisma/rls-app-role.sql` yorumları). RLS yalnızca ayrı bir `fabrika_app` (`NOBYPASSRLS`) rolüyle, `DATABASE_URL_RLS_TEST` üzerinden `tests/rls.spec.ts` içinde ölçülür. "Ana bağlantının fabrika_app'e çevrilmesi ayrı, sonraki bir iş" diye açıkça not düşülmüş (`prisma/rls-app-role.sql`).

**Sonuç:** Bugün `withTenant` kullanmak ile kullanmamak arasındaki gerçek fark Postgres'te DEĞİL, JS tarafındaki `where: { tenantId }` filtresinin doğru yazılıp yazılmadığındadır. RLS şu an üretim trafiğinde bir savunma katmanı DEĞİLDİR — yalnızca test ortamında doğrulanan, henüz devreye alınmamış bir gelecek savunmadır.

**Why:** TASK-MTU6I3V2R30M8 (101 sarmalayıcısız `prisma.*` çağrısı triyajı) sırasında keşfedildi. Bu bilgi olmadan "withTenant kullanmıyor → RLS onu koruyor mu koruyor mu" sorusu yanlış eksende sorulur; doğru soru her zaman "bu spesifik `where` cümlesi tenantId'yi doğru kaynaktan (session/token/trusted-webhook-metadata) alıp doğru filtreliyor mu"dur.

**How to apply:**
- Gelecekteki her tenant-isolation denetiminde önce bunu doğrula (dosya hâlâ mevcut mu, `.env`'deki rol hâlâ `fabrika` mı — `git log --oneline -- prisma/rls-app-role.sql .env.example` ile kontrol et, bu bilgi eskiyebilir).
- `src/app/[locale]/admin/layout.tsx` "RLS Protected / %100 Enforced" rozetleri gösteriyor — bu iddiayı kanıt olarak KULLANMA, kendisi yanlış (bkz. [[fabrika-admin-rls-badge-misleading]] varsa, yoksa docs/agent-results/TASK-MTU6I3V2R30M8-blok-zincir-denet-i.md §4.1).
- Ana bağlantı gerçekten `fabrika_app`'e çevrilirse: bu denetimde bulunan tüm sarmalayıcısız kiracı-tablosu çağrıları (o tarihte ~98 canlı kod satırı) aynı anda kırılır (sessiz boş sonuç ya da policy-violation hatası) — o migrasyonu yapan kişiye bu listeyi hatırlat.
- İlgili: [[a-conformance-check-cannot-see-absence]] — "withTenant var mı" diye bakmak, "RLS zaten etkisiz" gerçeğini görmez; asıl kanıt her zaman where-cümlesinin kendisidir.

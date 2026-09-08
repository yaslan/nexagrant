---
name: fabrika-rls-write-path-needs-app-tenant-id
description: Fabrika'da global prisma ile yazılan her satır RLS'e takılır — app.tenant_id yalnız withTenant içinde set ediliyor; platform/paylaşılan yazımların WITH CHECK dalı yok
metadata:
  type: project
updatedAt: 2026-09-08
---

`app.tenant_id` oturum değişkenini set eden TEK yer `withTenant`/`withTenantOn`
(`src/lib/db.ts:99`, `SELECT set_config('app.tenant_id', $1, true)`).

Dolayısıyla **global `prisma` istemcisiyle yapılan her INSERT'te `app.tenant_id`
set edilmemiştir** ve kiracıya özel bir tabloya yazıyorsa
`WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))` sağlanmaz →
`42501 new row violates row-level security policy`.

Yeni bir yazma yolu açarken sor: bu `withTenant` içinde mi çalışıyor? Değilse
tabloda RLS var mı? Özellikle `FORCE ROW LEVEL SECURITY` olanlarda (ör.
`AiUsageLog`) tablo sahibi bile muaf değildir.

**İki yapısal boşluk (2026-09-08 itibarıyla açık):**
- Platform kapsamlı yazımlar (kiracıya ait olmayan) için politika dalı yok.
  `src/lib/llm.ts` `'__platform__'` sentinel'i yazıyor ama bunu bir tenant
  bağlamı içinde yapmıyor → üretimde her zaman bloke (TASK-MTSWVADF7RQ1B F-1).
- `Document`/`Chunk`/`ConceptTemplate` politikası `tenant_or_shared`'ın
  `USING` dalında `IS NULL` var, `WITH CHECK`'te YOK → paylaşılan satır
  okunabiliyor ama yazılamıyor (TASK-MTSYCMWFL22CA).

Yerelde görünmez: [[fabrika-dev-db-role-bypasses-rls]]

# Memory Index

- [fabrika-a-done-marker-needs-a-tenant-isolation-table](fabrika-a-done-marker-needs-a-tenant-isolation-table.md) — Fabrika'da "bu iş yapıldı" işaretçisi ASLA AuditEvent'te yaşamaz — nullable tenantId'si onu tenant_or_shared sınıfına koyuyor, yani kiracı bağlamı dışında ne yazılabilir ne okunabilir; işaretçi tenant_isolation'lı kendi tablosunda ve parayı yazan transaction'ın içinde olmalı
- [fabrika-hand-applied-migration-and-prisma-migrations-table](fabrika-hand-applied-migration-and-prisma-migrations-table.md) — Fabrika'da migration'ı elle uygularken _prisma_migrations'a sha256(migration.sql) checksum'uyla kaydet — ON CONFLICT DO NOTHING orada DEDUPE ETMEZ (migration_name'de unique kısıt yok), sessizce ikinci satır yazar
- [fabrika-run-a-handler-under-the-rls-role](fabrika-run-a-handler-under-the-rls-role.md) — Fabrika'da bir handler'ı fabrika_app rolü altında koşturmak için process.env.DATABASE_URL'i @/lib/db yüklenmeden ÖNCE değiştir — ve ayrıcalıklı URL'i o satırdan önce yakala, yoksa admin istemcin de RLS rolüne bağlanır
- [fabrika-withtenant-migration-can-keep-bare-prisma](fabrika-withtenant-migration-can-keep-bare-prisma.md) — prisma.$transaction'ı withTenant'a taşırken platform tablosuna (Tenant, Plan) gerçek okuma varsa mock'ta prisma'yı da bırak, D1-D6'nın "hiç export etme" kapısı her dosyada geçerli değil

- [fabrika-server-component-branch-test-recipe](fabrika-server-component-branch-test-recipe.md) — Next server component'inin dallarını (boş/hata/veri) vitest'te koşturma tarifi — @/lib/db + @/lib/tenant + next-intl/server mock'la, client island'ı stub'la, renderToStaticMarkup ile HTML'e bak

- [cron-double-scope-pattern](cron-double-scope-pattern.md) — Multi-tenant cron jobs must consolidate reads and writes in a single tenant scope to prevent RLS evasion (anti-pattern trap & recording-runner test probe)

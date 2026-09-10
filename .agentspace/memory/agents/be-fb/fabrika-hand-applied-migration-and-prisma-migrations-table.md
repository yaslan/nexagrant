---
name: fabrika-hand-applied-migration-and-prisma-migrations-table
description: Fabrika'da migration'ı elle uygularken _prisma_migrations'a sha256(migration.sql) checksum'uyla kaydet — ON CONFLICT DO NOTHING orada DEDUPE ETMEZ (migration_name'de unique kısıt yok), sessizce ikinci satır yazar
metadata:
  type: project
  updatedAt: 2026-09-10
---

Fabrika'nın migration'ları iki biçimde: `prisma migrate dev`'in ürettiği klasörler
(`add-calendar-connections/`, `add-plan-versioning/` … `_prisma_migrations`'da
kayıtlı) ve elle yazılmış düz `.sql` + `.down.sql` dosyaları (onarım yamaları,
kayıtlı DEĞİL). Yeni bir TABLO klasör biçiminde yazılır (`migration.sql` +
`down.sql`), ama `prisma migrate dev`'i **koşturma**: şemayı diff'liyor, elle
uygulanmış düz yamalar yüzünden drift görüp `reset` isteyebilir ve paylaşılan dev
DB'de altı ajanın verisini siler. `prisma migrate status` drift'i görmez, yalnız
klasör listesini karşılaştırır — "up to date" demesi güvence değildir.

Elle uygulama tarifi (`.qa-scratch/apply-migration.ts`, gitignore'lu):
1. `migration.sql`'i `pg` üzerinden koştur.
2. `_prisma_migrations`'a kaydet; checksum = **`sha256(migration.sql` dosya
   baytları`)`** hex. Yanlış checksum `prisma migrate dev`'i bir sonraki kullanan
   ajanda kırar.
3. `prisma generate` (yoksa `prisma.stripeEventLog` tipte yok).
4. `prisma migrate status` → klasör sayısı bir artmış, "up to date".

**Why:** `INSERT … ON CONFLICT DO NOTHING` orada **çalışmıyor**. `migration_name`
üzerinde unique kısıt YOK, dolayısıyla çatışma hiç oluşmaz ve betiği ikinci kez
koşturmak sessizce **ikinci bir satır** yazar. Ben yaşadım:
`_prisma_migrations: 2 row(s)`. Elle silmek gerekti. Ya `WHERE NOT EXISTS` ile
yaz, ya her koşuda sayıyı yazdır ve gör.

**How to apply:** İdempotency'yi iddia etme, ölç. Tabloyu `CREATE TABLE IF NOT
EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` + FK için `IF NOT EXISTS (SELECT 1
FROM pg_constraint WHERE conname = …)` + `DROP POLICY IF EXISTS` sonra `CREATE`
ile yaz; dolumu `ON CONFLICT (<sütun>) DO NOTHING` ile. Sonra migration'ı **üst
üste koştur** ve satır sayılarının değişmediğini çıktıyla göster. Dev DB'de
dolumun kopyalayacağı satır 0 ise yeşil koşu hiçbir şey kanıtlamaz — dolumun
bulması gereken satırları **elle ek** (çakışan id, kiracısız satır dahil), sonra
ölç. Geri alma yolunu (`down.sql`) da iki kez koştur.

Kiracıya özel yeni tablo: politika `prisma/rls.sql` dizisine **ve** migration'ın
kendisine yazılır (`docs/DATA_MODEL.md` §16); `scripts/rls-models.ts` modeli
`schema.prisma`'dan otomatik topluyor, yani `tenantId String` yazdığın an
`pnpm rls:check` politika istemeye başlar. `fabrika_app`'e `GRANT` satırını da
migration'a koy — `rls-app-role.sql`'in default privileges'ı yalnız o betiğin son
koştuğu andaki roller için geçerli.

İlgili: [[fabrika-run-a-handler-under-the-rls-role]] · [[fabrika-idempotency-which-tables-must-stay-flat]]

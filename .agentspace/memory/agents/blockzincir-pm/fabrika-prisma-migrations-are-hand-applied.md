---
name: fabrika-prisma-migrations-are-hand-applied
description: Fabrika'da şema değişikliği reçetesi — klasörlü migration + prisma migrate deploy + pnpm db:rls; migrate dev KULLANMA, RLS'i hem rls.sql'e hem migration'a yaz
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08'de uçtan uca koştu (TASK-MTSAIWF4ENUSL). Sıra:

1. `prisma/schema.prisma`'yı düzenle.
2. `prisma/migrations/<ad>/migration.sql` yaz (elle, idempotent: `IF NOT EXISTS`), yanına `down.sql`.
   Depodaki eski düz `*.sql` dosyaları migrate'in gözüne görünmez — yalnız KLASÖRLÜ olanlar uygulanır.
3. `npx prisma generate && npx prisma migrate deploy`. **`prisma migrate dev` (= `pnpm db:migrate`)
   kullanma**: şemanın çoğu `db push` ile kurulmuş, `_prisma_migrations` yalnız 2 kayıt taşıyordu;
   `migrate dev` drift görüp reset isteyebilir. `deploy` sadece uygulanmamışları uygular ve klasör
   adı zaman damgasız olsa da sorun çıkarmadı.
4. Kiracıya özel tabloysa `prisma/rls.sql`'deki FOREACH dizisine ekle **VE** politikayı migration'ın
   içinde de yaz (migration'dan kurulan DB kısa süre bile kiracılar arası okunur olmasın).
5. `pnpm db:rls` (tsx üzerinden çalışır, psql gerektirmez) → `pnpm rls:verify` (canlı ölçüm).

Kapı: `scripts/rls-models.ts` tenant-scoped modeli `tenantId String` satırından REGEX ile bulur;
yeni tablon otomatik listeye girer, yani rls.sql'e eklemeyi unutursan `pnpm gate` seni yakalar.
Gerçek izolasyon ölçümü ise `DATABASE_URL_RLS_TEST` (rol `fabrika_app`, NOBYPASSRLS) üzerinden —
varsayılan `fabrika` rolü SUPERUSER olduğu için onunla yapılan ölçüm hiçbir şey kanıtlamaz.

---
name: fabrika-local-dev-db
description: Fabrika yerel dev Postgres'i sıfırdan nasıl kurulur ve neden yerelde RLS gerçekten test edilemez
metadata:
  type: project
updatedAt: 2026-09-06
---

Fabrika deposunda makinede kurulu Postgres/psql YOK ve `docker` CLI PATH'te değil — gerçek yol
`/Applications/Docker.app/Contents/Resources/bin/docker` (`~/.docker/bin` yok). Daemon `open -a Docker`
ile başlatılır. Dev DB `docker-compose.yml`'deki `postgres-vector` (pgvector/pgvector:pg16) servisidir.

İki tuzak:
1. Compose `POSTGRES_DB=fabrika_db` oluşturur, ama `.env`'deki `DATABASE_URL` `…/fabrika` ister.
   `fabrika` DB'sini ayrıca oluşturmak ve `CREATE EXTENSION vector` çalıştırmak gerekir. Compose'un
   `fabrika` rol parolası da `.env`'dekiyle uyuşmaz; `ALTER ROLE` ile hizalanır.
2. **Container'ın `fabrika` rolü SUPERUSER + BYPASSRLS'tir.** `prisma/rls.sql` 36 politikayı kurar ve
   tablolarda `FORCE ROW LEVEL SECURITY` açar, ama bu rol politikalara TABİ DEĞİLDİR. Yani yerelde
   "RLS çalışıyor" doğrulaması YAPILAMAZ — seed ve uygulama sorguları RLS'i hiç görmeden geçer.
   Gerçek izolasyon testi için `NOBYPASSRLS` olan ayrı bir uygulama rolü gerekir.

`prisma/migrations/` işlevsel değil (tek klasör, zaman damgası öneki ve `migration_lock.toml` yok,
SQL idempotent değil) → şema `prisma db push` ile kurulur. Prisma 7 bu komutu AI ajanları için kilitler;
kullanıcı onayı alınıp `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<onay metni>"` ile çalıştırılır.

Sıra ÖNEMLİ: `db push` → `rls.sql` → `pnpm db:seed`.

İlgili: [[fabrika-prisma7-driver-adapter]]

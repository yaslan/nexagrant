---
name: fabrika-docker-broken-symlink
description: Bu makinede docker "yok" DEĞİL — /usr/local/bin/docker kırık symlink; çalışan CLI /Applications/Docker.app/Contents/Resources/bin/docker ve postgres-vector ayakta
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Fabrika raporlarında tekrar eden "bu makinede docker/Postgres yok" tespiti **YANLIŞ** — ölçüldü
(2026-09-06):

- `command -v docker` → boş. Sebep: `/usr/local/bin/docker` **kırık bir symlink**;
  `/Volumes/Docker/Docker.app/...` yani artık bağlı olmayan kurulum diskini gösteriyor.
- Çalışan gerçek CLI: **`/Applications/Docker.app/Contents/Resources/bin/docker`** (41 MB, çalışıyor).
- Onunla ölçülen: `postgres-vector` container'ı (`pgvector/pgvector:pg16`) **Up (healthy)**,
  `0.0.0.0:5432->5432/tcp` yayınlıyor; `nc -z localhost 5432` başarılı.
- `psql` ve `pg_isready` gerçekten PATH'te yok — DB'ye container içinden eriş:
  `/Applications/Docker.app/Contents/Resources/bin/docker exec postgres-vector psql -U fabrika -d fabrika -c "..."`

Yani seed / migration / RLS doğrulaması bu makinede **yapılabilir**. "DB yok, doğrulanamadı" diye
rapor kapatmadan önce yukarıdaki tam yolu dene. `.env`: `DATABASE_URL` → `fabrika` rolü (SUPERUSER +
BYPASSRLS, bkz. [[fabrika-rls-bypass-local-dev]]), `DATABASE_URL_MIGRATE` → `fabrika_migrate` rolü.

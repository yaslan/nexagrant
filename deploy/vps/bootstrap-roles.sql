-- Sahip ve iş rolleri (RUNBOOK §4 adım 0). Yalnız ilk kurulumda, boş veritabanında koşar.
-- Koşturan: deploy/vps/ops.sh bootstrap — postgres konteynerinde süper kullanıcı (fabrika) ile,
-- yerel soket üzerinden. Parolalar stdin'den \set ile gelir (owner_pw, jobs_pw); dosyaya ve
-- komut satırına yazılmaz. Tekrar koşması zararsızdır: mevcut roller değişmez.
--
-- Rol modeli:
--   fabrika       süper kullanıcı (POSTGRES_USER). Yalnız ilk kurulum ve yedek (BACKUP_DATABASE_URL).
--   fabrika_owner şema sahibi: db push, migrasyon, rls, seed, verify. SÜPER KULLANICI DEĞİL.
--   fabrika_app   uygulama (web + worker): BYPASSRLS yok. scripts/setup-rls-role.ts oluşturur.
--   fabrika_jobs  worker'ın graphile_worker şeması: CONNECT + CREATE ON DATABASE; başka yetki yok.

\set ON_ERROR_STOP on

-- Sahip rol. BYPASSRLS: FORCE RLS altında migrasyon, seed ve doğrulama satır görebilsin
-- (docs/RELEASE_CHECKLIST.md §3.1 adım 1a: süper kullanıcı olmayan rol kapsam olmadan 0 satır görür).
-- CREATEROLE: rls-role adımı fabrika_app'i bu rolle oluşturur.
SELECT format('CREATE ROLE fabrika_owner LOGIN NOSUPERUSER BYPASSRLS CREATEROLE NOCREATEDB PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_owner') \gexec

SELECT format('CREATE ROLE fabrika_jobs LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'jobs_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_jobs') \gexec

-- Veritabanı ve public şema sahipliği sahip role geçer: tablolar onun adına oluşur.
SELECT format('ALTER DATABASE %I OWNER TO fabrika_owner', current_database()) \gexec
ALTER SCHEMA public OWNER TO fabrika_owner;

-- Worker: graphile_worker şemasını kurabilsin. PostgreSQL PUBLIC'e CREATE vermez, bu yüzden açıkça verilir.
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO fabrika_jobs', current_database()) \gexec

-- pgvector: uzantıyı süper kullanıcı kurar; sahip rol şemayı db push ile kurar (prisma/schema.prisma extensions = [vector]).
CREATE EXTENSION IF NOT EXISTS vector;

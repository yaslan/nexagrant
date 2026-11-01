#!/usr/bin/env bash
# devop-fb TASK-MUOGMUUAWFEQX: izole taban DB kurar (sahip rolü fabrika_migrate, NOSUPERUSER NOBYPASSRLS).
# Kullanım: o25-base.sh <db>   (cwd = worktree). Parolalar atılabilir konteyner fikstürü.
set -euo pipefail
DB=$1
H=127.0.0.1:55225
SU=postgresql://fabrika:***@$H
psql "$SU/fabrika" -X -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fabrika_migrate') THEN
    CREATE ROLE fabrika_migrate LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '***';
  END IF; END \$\$;
DROP DATABASE IF EXISTS $DB WITH (FORCE);
CREATE DATABASE $DB OWNER fabrika_migrate;
SQL
psql "$SU/$DB" -X -q -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector' -c 'ALTER SCHEMA public OWNER TO fabrika_migrate'
DATABASE_URL=postgresql://fabrika_migrate:***@$H/$DB node_modules/.bin/prisma db push >/dev/null 2>&1 && echo "db push (sahip) exit=0"
DATABASE_URL=$SU/$DB DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@$H/$DB pnpm -s db:rls-role >/dev/null && echo "db:rls-role exit=0"
psql "$SU/$DB" -X -q -v ON_ERROR_STOP=1 -v owner=fabrika_migrate -f prisma/migration-owner-grant.sql 2>&1 | grep -E 'NOTICE|fabrika' || true

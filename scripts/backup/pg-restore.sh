#!/usr/bin/env bash
# Restore a pg-backup.sh dump into an EMPTY database (docs/RELEASE_CHECKLIST.md §4.3).
#
#   RESTORE_DATABASE_URL=postgresql://<owner-role>@host:port/<new_db> \
#   pnpm backup:restore path/to/fonbridge-<stamp>.dump
#
# This is the real restore, not the drill: it never creates, drops or cleans a
# database. The target must already exist and hold no table, view or sequence
# in `public` or `graphile_worker`; anything else is refused, so a wrong URL
# cannot overwrite a live database. Create it first, e.g.
#   createdb -O <owner-role> fabrika_restored
# The roles the dump grants to (fabrika_app) must exist on the target cluster
# (`pnpm db:rls-role` locally; production: §4.3). Afterwards run
# `pnpm db:rls && pnpm rls:verify --require-db` against it (§4.2 step 3).
#
# The dump path is required (no "newest file" guess for a real restore).
# Encrypted dumps (.age) must be decrypted with `age -d` first.
# Password handling as pg-backup.sh: PGPASSWORD per call, never argv (pg-url.sh).
# Rollback: the target was empty, so drop it and start again.

set -euo pipefail

log() { printf '%s [pg-restore] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAIL: $*" >&2; exit 1; }

for bin in pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || fail "$bin not found on PATH"
done

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is not set (the existing, empty target database)}"

dump="${1:-}"
[ -n "$dump" ] || fail "usage: pg-restore.sh <path/to/fonbridge-<stamp>.dump>"
case "$dump" in
  *.age) fail "encrypted backup ($(basename "$dump")); decrypt it with 'age -d' to a .dump first" ;;
esac
[ -s "$dump" ] || fail "dump not found or empty: $(basename "$dump")"

if [ -f "$dump.sha256" ]; then
  ( cd "$(dirname "$dump")" && shasum -a 256 -c "$(basename "$dump.sha256")" ) >/dev/null || fail "checksum mismatch for $(basename "$dump")"
  log "checksum ok"
else
  log "no $(basename "$dump").sha256 next to the dump; checksum not verified"
fi

# shellcheck source=pg-url.sh
source "$(dirname "$0")/pg-url.sh"
pg_url_split RESTORE_DATABASE_URL || fail "RESTORE_DATABASE_URL could not be parsed (see above)"

# Emptiness guard: relations (tables, views, sequences, …) in the two schemas
# a dump writes. A fresh `createdb` has none; the pgvector extension and
# graphile_worker come from the dump itself.
objects="$(PGPASSWORD="$PG_PASS" psql "$PG_CONN" -X -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'graphile_worker') and c.relkind in ('r','p','v','m','S','f')")" \
  || fail "could not reach the target database"
[ "$objects" = 0 ] || fail "target database $PG_DB is not empty ($objects relations in public/graphile_worker); refusing"

started=$(date +%s)
log "restoring $(basename "$dump") into $PG_DB"
PGPASSWORD="$PG_PASS" pg_restore --dbname="$PG_CONN" --no-owner --exit-on-error "$dump" \
  || fail "pg_restore failed (see its messages above); drop $PG_DB and retry"

tables="$(PGPASSWORD="$PG_PASS" psql "$PG_CONN" -X -At -c \
  "select count(*) from information_schema.tables
   where table_type = 'BASE TABLE' and table_schema in ('public', 'graphile_worker')")"
log "ok: $tables tables restored into $PG_DB in $(( $(date +%s) - started ))s"
log "next: pnpm db:rls && pnpm rls:verify --require-db against this database"

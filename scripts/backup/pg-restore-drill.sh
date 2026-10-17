#!/usr/bin/env bash
# Restore drill (docs/RELEASE_CHECKLIST.md §4.2): restore a dump into a SCRATCH
# database and prove the row counts match the source.
#
#   RESTORE_ADMIN_URL=postgresql://<superuser>@host:port/postgres \
#   BACKUP_DATABASE_URL=postgresql://<bypassrls-role>@host:port/fabrika \
#   pnpm backup:restore-drill [path/to/fonbridge-<stamp>.dump]
#
# Without a path, the newest fonbridge-*.dump in BACKUP_DIR (default ./backups)
# is used.
#
# What it does:
#   1. Refuses to touch the source database or any name equal to it.
#   2. Drops and recreates ONLY the scratch database (RESTORE_DB, default
#      fabrika_restore_drill) on the same server.
#   3. pg_restore --exit-on-error into it. Any restore error fails the drill.
#   4. Counts rows of every base table in public + graphile_worker, on both the
#      source and the restored database, each inside one REPEATABLE READ
#      transaction. Any difference fails the drill.
#
# Limits, stated plainly: the source is read a few seconds after the dump. If
# the source takes writes in that window, counts differ and the drill fails; run
# it when the source is quiet, or compare against the dump's own snapshot.
# The drill does NOT run `pnpm db:rls-role && pnpm db:rls && pnpm rls:verify`
# against the restored database; that is checklist §4.2 step 3 and stays manual.

set -euo pipefail

log() { printf '%s [restore-drill] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAIL: $*"; exit 1; }

for bin in pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || fail "$bin not found on PATH"
done

: "${RESTORE_ADMIN_URL:?RESTORE_ADMIN_URL is not set (superuser or CREATEDB role, connected to the postgres database)}"
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set (the source, used for the row-count comparison)}"

RESTORE_DB="${RESTORE_DB:-fabrika_restore_drill}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

# Name guards: the scratch database must be a different database from the source.
src_db="$(psql "$BACKUP_DATABASE_URL" -X -At -c 'select current_database()')"
[ "$RESTORE_DB" != "$src_db" ] || fail "RESTORE_DB ($RESTORE_DB) equals the source database; refusing"
[ "$RESTORE_DB" != "fabrika" ] || fail "RESTORE_DB must not be 'fabrika'"
[[ "$RESTORE_DB" =~ ^[a-z0-9_]+$ ]] || fail "RESTORE_DB must match ^[a-z0-9_]+$"

dump="${1:-}"
if [ -z "$dump" ]; then
  dump="$(ls -1t "$BACKUP_DIR"/fonbridge-*.dump "$BACKUP_DIR"/fonbridge-*.dump.age 2>/dev/null | head -n 1 || true)"
  [ -n "$dump" ] || fail "no dump given and none found in $BACKUP_DIR"
fi
# An encrypted backup is not drilled: this script does not decrypt. Fail loudly
# instead of letting an undecryptable file pass as a restore proof.
case "$dump" in
  *.age) fail "encrypted backup ($(basename "$dump")) cannot be drilled here; decrypt it with 'age -d' to a .dump first" ;;
esac
[ -s "$dump" ] || fail "dump not found or empty: $(basename "$dump")"

# Checksum, when the backup wrote one.
if [ -f "$dump.sha256" ]; then
  ( cd "$(dirname "$dump")" && shasum -a 256 -c "$(basename "$dump.sha256")" ) >/dev/null || fail "checksum mismatch for $(basename "$dump")"
  log "checksum ok"
fi

# Row counts as one SQL statement: every base table, one snapshot per side.
count_sql() {
  cat <<'SQL'
select string_agg(
  format('select %L as tbl, count(*)::bigint as n from %I.%I',
         table_schema || '.' || table_name, table_schema, table_name),
  ' union all ' order by table_schema, table_name)
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema in ('public', 'graphile_worker')
SQL
}

counts_of() {
  local url="$1" union
  union="$(psql "$url" -X -At -c "$(count_sql)")"
  [ -n "$union" ] || fail "no tables found on $2"
  psql "$url" -X -At -v ON_ERROR_STOP=1 \
    -c 'begin isolation level repeatable read' \
    -c "select tbl || '=' || n from ($union) q order by tbl" \
    -c 'commit' | grep '=' || true
}

# The restored database URL: same server and credentials as the admin URL, new db name.
restored_url="$(RESTORE_ADMIN_URL="$RESTORE_ADMIN_URL" RESTORE_DB="$RESTORE_DB" node -e '
  const u = new URL(process.env.RESTORE_ADMIN_URL);
  u.pathname = "/" + process.env.RESTORE_DB;
  process.stdout.write(u.toString());
')"

started=$(date +%s)
log "recreating scratch database $RESTORE_DB"
psql "$RESTORE_ADMIN_URL" -X -q -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$RESTORE_DB\" with (force)" \
  -c "create database \"$RESTORE_DB\""

log "restoring $(basename "$dump")"
pg_restore --dbname="$restored_url" --no-owner --exit-on-error "$dump" \
  || fail "pg_restore failed (see its messages above)"
restored_s=$(date +%s)

log "comparing row counts (source vs $RESTORE_DB)"
src_counts="$(counts_of "$BACKUP_DATABASE_URL" source)"
dst_counts="$(counts_of "$restored_url" restored)"
tables=$(printf '%s\n' "$src_counts" | grep -c '=' || true)

diff_out="$(diff <(printf '%s\n' "$src_counts") <(printf '%s\n' "$dst_counts") || true)"
if [ -n "$diff_out" ]; then
  printf '%s\n' "$diff_out"
  fail "row counts differ between source and restored database"
fi

log "table row counts (identical on both sides):"
printf '%s\n' "$dst_counts" | sed 's/^/    /'
log "ok: $tables tables, restore $(( restored_s - started ))s, total $(( $(date +%s) - started ))s"

if [ "${RESTORE_KEEP:-0}" != "1" ]; then
  psql "$RESTORE_ADMIN_URL" -X -q -c "drop database if exists \"$RESTORE_DB\" with (force)"
  log "scratch database dropped (set RESTORE_KEEP=1 to keep it)"
fi

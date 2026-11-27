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
#   5. Compares sample records: per table, an md5 of the first DRILL_SAMPLE_ROWS
#      rows (default 5) in row-text order, computed in the same snapshot as the
#      count. A row that restored with different content fails the drill even
#      when the count matches. Sorting is by the whole row text, so a very large
#      table costs one sort per side; set DRILL_SAMPLE_ROWS=0 to skip samples.
#   6. Appends one tab-separated line per run to RESTORE_DRILL_LOG (default
#      $BACKUP_DIR/restore-drill.log): start and end (UTC), duration in seconds,
#      ok|fail, dump file name, table count, failure reason. Failures are
#      recorded too; only a missing or unparsable URL (before the log path is
#      known) is not. The log holds no connection string or password.
#
# Limits, stated plainly: the source is read a few seconds after the dump. If
# the source takes writes in that window, counts differ and the drill fails; run
# it when the source is quiet, or compare against the dump's own snapshot.
# The drill does NOT run `pnpm db:rls-role && pnpm db:rls && pnpm rls:verify`
# against the restored database; that is checklist §4.2 step 3 and stays manual.

set -euo pipefail

log() { printf '%s [restore-drill] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail_reason=""
fail() { fail_reason="$*"; log "FAIL: $*" >&2; exit 1; }

for bin in pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || fail "$bin not found on PATH"
done

: "${RESTORE_ADMIN_URL:?RESTORE_ADMIN_URL is not set (superuser or CREATEDB role, connected to the postgres database)}"
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set (the source, used for the row-count comparison)}"

RESTORE_DB="${RESTORE_DB:-fabrika_restore_drill}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DRILL_SAMPLE_ROWS="${DRILL_SAMPLE_ROWS:-5}"
[[ "$DRILL_SAMPLE_ROWS" =~ ^[0-9]+$ ]] || fail "DRILL_SAMPLE_ROWS must be a non-negative integer"
RESTORE_DRILL_LOG="${RESTORE_DRILL_LOG:-$BACKUP_DIR/restore-drill.log}"

# Drill record (step 6): written on every exit from here on, pass or fail.
drill_started_at="$(date -u +%FT%TZ)"
drill_started_s=$(date +%s)
drill_dump="-"
drill_tables="-"
record_drill() {
  local rc=$? result=ok reason="-"
  [ "$rc" = 0 ] || { result=fail; reason="${fail_reason:-exit $rc}"; }
  mkdir -p "$(dirname "$RESTORE_DRILL_LOG")" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$drill_started_at" "$(date -u +%FT%TZ)" \
    "$(( $(date +%s) - drill_started_s ))" "$result" "$drill_dump" "$drill_tables" \
    "$(printf '%s' "$reason" | tr '\t\n' '  ')" >> "$RESTORE_DRILL_LOG" \
    || log "WARN: could not append to $RESTORE_DRILL_LOG" >&2
  return "$rc"
}
trap record_drill EXIT

# Split both URLs (pg-url.sh). Passwords travel in PGPASSWORD per call, never in
# argv; the connection strings handed to psql/pg_restore carry no password.
# shellcheck source=pg-url.sh
source "$(dirname "$0")/pg-url.sh"
pg_url_split BACKUP_DATABASE_URL || fail "BACKUP_DATABASE_URL could not be parsed (see above)"
src_conn="$PG_CONN"
src_pass="$PG_PASS"
pg_url_split RESTORE_ADMIN_URL || fail "RESTORE_ADMIN_URL could not be parsed (see above)"
admin_conn="$PG_CONN"
admin_prefix="$PG_CONN_BASE"
admin_query="$PG_QUERY"
admin_pass="$PG_PASS"

# Name guards: the scratch database must be a different database from the source.
src_db="$(PGPASSWORD="$src_pass" psql "$src_conn" -X -At -c 'select current_database()')"
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
drill_dump="$(basename "$dump")"
[ -s "$dump" ] || fail "dump not found or empty: $(basename "$dump")"

# Checksum, when the backup wrote one.
if [ -f "$dump.sha256" ]; then
  ( cd "$(dirname "$dump")" && shasum -a 256 -c "$(basename "$dump.sha256")" ) >/dev/null || fail "checksum mismatch for $(basename "$dump")"
  log "checksum ok"
fi

# Row counts and sample hashes as one SQL statement: every base table, one
# snapshot per side. The sample is the md5 of the first DRILL_SAMPLE_ROWS row
# texts in sorted order ('-' when samples are off).
count_sql() {
  cat <<SQL
select string_agg(
  format('select %L as tbl, count(*)::bigint as n, '
         || case when $DRILL_SAMPLE_ROWS > 0 then
              '(select md5(coalesce(string_agg(r, chr(10) order by r), %L)) from '
              || '(select t::text as r from %I.%I t order by 1 limit $DRILL_SAMPLE_ROWS) s) as sample'
            else '%L::text as sample' end
         || ' from %I.%I',
         table_schema || '.' || table_name,
         case when $DRILL_SAMPLE_ROWS > 0 then '' else '-' end,
         table_schema, table_name, table_schema, table_name),
  ' union all ' order by table_schema, table_name)
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema in ('public', 'graphile_worker')
SQL
}

# counts_of CONN PASS LABEL
# psql's exit code is checked on its own: a failed count query must fail the
# drill, never leave an empty list that compares equal to an empty list.
counts_of() {
  local conn="$1" pass="$2" label="$3" union out
  union="$(PGPASSWORD="$pass" psql "$conn" -X -At -c "$(count_sql)")" || fail "could not list tables on $label"
  [ -n "$union" ] || fail "no tables found on $label"
  out="$(PGPASSWORD="$pass" psql "$conn" -X -At -v ON_ERROR_STOP=1 \
    -c 'begin isolation level repeatable read' \
    -c "select tbl || '=' || n || ' sample=' || sample from ($union) q order by tbl" \
    -c 'commit')" || fail "row count query failed on $label"
  out="$(printf '%s\n' "$out" | grep '=' || true)"
  [ -n "$out" ] || fail "row count query returned no rows on $label"
  printf '%s\n' "$out"
}

# The restored database: same server and credentials as the admin URL, new db name.
restored_conn="$admin_prefix/$RESTORE_DB${admin_query:+?$admin_query}"

# Role precondition, before the scratch database is dropped: the dump GRANTs to
# fabrika_app, and a cluster without it fails the restore on the first GRANT.
# shellcheck source=pg-app-role.sh
source "$(dirname "$0")/pg-app-role.sh"
rc=0; pg_app_role_exists "$admin_conn" "$admin_pass" || rc=$?
case "$rc" in
  0) ;;
  1) fail "role fabrika_app does not exist on the target cluster; the dump's GRANTs would fail the restore. Create the role first (locally: pnpm db:rls-role; production: docs/RELEASE_CHECKLIST.md §4.4), then retry" ;;
  *) fail "could not query pg_roles via RESTORE_ADMIN_URL" ;;
esac

started=$(date +%s)
log "recreating scratch database $RESTORE_DB"
PGPASSWORD="$admin_pass" psql "$admin_conn" -X -q -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$RESTORE_DB\" with (force)" \
  -c "create database \"$RESTORE_DB\""

log "restoring $(basename "$dump")"
PGPASSWORD="$admin_pass" pg_restore --dbname="$restored_conn" --no-owner --exit-on-error "$dump" \
  || fail "pg_restore failed (see its messages above)"
restored_s=$(date +%s)

log "comparing row counts and sample records (source vs $RESTORE_DB)"
# counts_of runs in a subshell, so its own fail reason does not reach the
# record; name the side here instead.
src_counts="$(counts_of "$src_conn" "$src_pass" source)" || fail "counting rows on source failed"
dst_counts="$(counts_of "$restored_conn" "$admin_pass" restored)" || fail "counting rows on restored failed"
tables=$(printf '%s\n' "$src_counts" | grep -c '=' || true)
[ "$tables" -gt 0 ] || fail "no tables counted on source"
drill_tables="$tables"

diff_out="$(diff <(printf '%s\n' "$src_counts") <(printf '%s\n' "$dst_counts") || true)"
if [ -n "$diff_out" ]; then
  printf '%s\n' "$diff_out"
  fail "row counts or sample records differ between source and restored database ($(printf '%s\n' "$diff_out" | grep -c '^<') tables)"
fi

log "table row counts and sample hashes (identical on both sides):"
printf '%s\n' "$dst_counts" | sed 's/^/    /'
log "ok: $tables tables, restore $(( restored_s - started ))s, total $(( $(date +%s) - started ))s"

if [ "${RESTORE_KEEP:-0}" != "1" ]; then
  PGPASSWORD="$admin_pass" psql "$admin_conn" -X -q -c "drop database if exists \"$RESTORE_DB\" with (force)"
  log "scratch database dropped (set RESTORE_KEEP=1 to keep it)"
fi

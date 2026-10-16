#!/usr/bin/env bash
# Logical Postgres backup (docs/RELEASE_CHECKLIST.md §4.1).
#
#   BACKUP_DATABASE_URL=postgresql://... pnpm backup:db
#
# Writes one custom-format dump per run, then reads its table of contents back
# with `pg_restore --list`, so a dump that cannot be read is a failed backup,
# not a silent one. Exit code is non-zero on any failure; the caller (cron, CI)
# is responsible for turning that into an alert (checklist §5.3).
#
# Required: BACKUP_DATABASE_URL. Use a role that BYPASSRLS (or is superuser):
# a NOBYPASSRLS role such as fabrika_app sees zero tenant rows and produces an
# empty-looking backup that still exits 0. This script refuses to run without
# the variable; it never falls back to DATABASE_URL.
#
# Optional:
#   BACKUP_DIR            output directory          (default: ./backups)
#   BACKUP_KEEP_DAYS      delete dumps older than N days in BACKUP_DIR (default: 7)
#                         Only this single rule is implemented; the 4-week and
#                         12-month tiers of §4.1 are NOT implemented here.
#   BACKUP_AGE_RECIPIENT  age public key; when set and `age` is installed, the
#                         dump is encrypted to <file>.age and the plain file is
#                         removed. The private key stays out of this repo.
#
# The connection string is never printed. Logs carry the file name and sizes only.

set -euo pipefail

log() { printf '%s [pg-backup] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAIL: $*"; exit 1; }

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found on PATH"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found on PATH"

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set (use a BYPASSRLS role; see header)}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/fonbridge-$stamp.dump"
tmp="$dump.partial"

# A half-written file must never be mistaken for a backup.
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

log "dumping to $(basename "$dump")"
# --no-owner: ownership is not restored, so the dump loads under any owner role.
# GRANTs are KEPT on purpose: fabrika_app's grants and the RLS policies are part
# of what the restored database must enforce. Restore needs the roles the dump
# grants to (fabrika_app) to exist on the target cluster (see pg-restore-drill.sh).
# graphile_worker and pgvector objects are included (checklist §4.1).
pg_dump --dbname="$BACKUP_DATABASE_URL" \
  --format=custom --no-owner \
  --file="$tmp"

[ -s "$tmp" ] || fail "dump is empty"

# Readability check: the TOC must parse. This does not prove the data restores;
# scripts/backup/pg-restore-drill.sh does that.
toc_entries="$(pg_restore --list "$tmp" | grep -c -v '^;' || true)"
[ "$toc_entries" -gt 0 ] || fail "pg_restore --list shows no entries"

mv "$tmp" "$dump"
trap - EXIT

final="$dump"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  if command -v age >/dev/null 2>&1; then
    age -r "$BACKUP_AGE_RECIPIENT" -o "$dump.age" "$dump"
    rm -f "$dump"
    final="$dump.age"
    log "encrypted with age"
  else
    fail "BACKUP_AGE_RECIPIENT is set but 'age' is not installed; refusing to keep a plain dump silently"
  fi
fi

# Checksum next to the file so a copy made off-server can be verified.
( cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$final")" > "$(basename "$final").sha256" )

log "ok: $(basename "$final") $(du -h "$final" | cut -f1) toc_entries=$toc_entries"

# Retention: delete only files this script names, so unrelated files stay.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'fonbridge-*.dump' -o -name 'fonbridge-*.dump.age' -o -name 'fonbridge-*.sha256' \) \
  -mtime +"$BACKUP_KEEP_DAYS" -print -delete | sed 's/^/[pg-backup] pruned /' || true

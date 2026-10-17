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
# Required: BACKUP_DATABASE_URL. Use a role that BYPASSRLS (or is superuser).
# A NOBYPASSRLS role such as fabrika_app makes pg_dump fail loudly (permission
# denied on the private schema, measured: exit 1, no file written). The script
# does not check the role's BYPASSRLS flag itself. This script refuses to run
# without the variable; it never falls back to DATABASE_URL.
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
# The connection string and password are never printed, and the password never
# reaches a command line (ps shows argv to every local user). It goes to a 0600
# PGPASSFILE that is removed on exit. Logs carry the file name and sizes only.

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

# A half-written file must never be mistaken for a backup. The PGPASSFILE holds
# the password, so it must not outlive the run either.
pgpass=""
cleanup() {
  rm -f "$tmp"
  if [ -n "$pgpass" ]; then rm -f "$pgpass"; fi
}
trap cleanup EXIT

# Split BACKUP_DATABASE_URL: the password goes to a PGPASSFILE, the rest stays in
# the URL that pg_dump receives. Error messages name the variable, never its value.
url_re='^postgres(ql)?://([^:/?#@]*)(:([^@/?#]*))?@([^/?#]*)/([^?#]*)(\?([^#]*))?$'
[[ "$BACKUP_DATABASE_URL" =~ $url_re ]] || fail "BACKUP_DATABASE_URL is not a postgresql:// URL with user@host/db"
url_user="${BASH_REMATCH[2]}"
url_pass="${BASH_REMATCH[4]}"
hostport="${BASH_REMATCH[5]}"
url_db="${BASH_REMATCH[6]}"
url_query="${BASH_REMATCH[8]}"
[[ "$hostport" != \[* ]] || fail "IPv6 host in BACKUP_DATABASE_URL is not supported"
[[ "$url_query" != *password=* ]] || fail "password= in the BACKUP_DATABASE_URL query is not supported; put it in the userinfo"

# Percent-decoding for libpq. Only the passfile gets the decoded values.
url_decode() { local s="${1//%/\\x}"; printf '%b' "$s"; }
# A passfile line escapes backslash and colon in each of its five fields.
pgpass_field() { local s="${1//\\/\\\\}"; printf '%s' "${s//:/\\:}"; }

user="$(url_decode "$url_user")"
pass="$(url_decode "$url_pass")"
db="$(url_decode "$url_db")"
if [[ "$hostport" == *:* ]]; then
  host="${hostport%:*}"
  port="${hostport##*:}"
else
  host="$hostport"
  port="*"
fi
conn="postgresql://${url_user}@${hostport}/${url_db}${url_query:+?$url_query}"

if [ -n "$pass" ]; then
  # mktemp creates the file 0600, so the password is never readable by others.
  pgpass="$(mktemp "${TMPDIR:-/tmp}/fonbridge-pgpass.XXXXXX")"
  printf '%s:%s:%s:%s:%s\n' \
    "$(pgpass_field "${host:-*}")" "$(pgpass_field "$port")" \
    "$(pgpass_field "${db:-*}")" "$(pgpass_field "${user:-*}")" \
    "$(pgpass_field "$pass")" > "$pgpass"
  export PGPASSFILE="$pgpass"
fi

log "dumping to $(basename "$dump")"
# --no-owner: ownership is not restored, so the dump loads under any owner role.
# GRANTs are KEPT on purpose: fabrika_app's grants and the RLS policies are part
# of what the restored database must enforce. Restore needs the roles the dump
# grants to (fabrika_app) to exist on the target cluster (see pg-restore-drill.sh).
# graphile_worker and pgvector objects are included (checklist §4.1).
pg_dump --dbname="$conn" \
  --format=custom --no-owner \
  --file="$tmp"

# The password has been used; remove the passfile before the TOC read.
if [ -n "$pgpass" ]; then rm -f "$pgpass"; pgpass=""; fi

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

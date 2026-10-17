# Shared by pg-backup.sh and pg-restore-drill.sh. Sourced, never run.
#
# pg_url_split VAR_NAME splits the postgresql:// URL held in VAR_NAME into:
#   PG_CONN_BASE  postgresql://<user>@<host:port>      (no password, no db)
#   PG_DB, PG_QUERY, PG_USER, PG_PASS (percent-decoded), PG_HOST, PG_PORT
# Callers pass the password per command as PGPASSWORD=... so it never reaches
# argv, and no password file is written. Error messages name VAR_NAME, never
# its value. Returns 1 on bad input.

# Percent-decoding for one field. Only %XX is decoded, byte by byte. A raw
# backslash, a raw CR/LF, a malformed %XX, or an encoded NUL/CR/LF is rejected
# instead of guessed, because a silently wrong password only fails later.
pg_url_decode() {
  local s="$1" out="" rest hex ch
  [[ "$s" != *\\* ]] || return 1
  [[ "$s" != *$'\n'* && "$s" != *$'\r'* ]] || return 1
  while [[ "$s" == *%* ]]; do
    out+="${s%%%*}"
    rest="${s#*%}"
    hex="${rest:0:2}"
    [[ "$hex" =~ ^[0-9A-Fa-f]{2}$ ]] || return 1
    printf -v ch "\\x$hex"
    case "$ch" in
      ''|$'\n'|$'\r') return 1 ;;
    esac
    out+="$ch"
    s="${rest:2}"
  done
  printf '%s' "$out$s"
}

pg_url_split() {
  local name="$1" url="${!1}" re
  re='^postgres(ql)?://([^:/?#@]*)(:([^@/?#]*))?@([^@/?#]*)/([^?#]*)(\?([^#]*))?$'
  [[ "$url" =~ $re ]] || { echo "$name is not a postgresql:// URL with user@host/db" >&2; return 1; }
  local raw_user="${BASH_REMATCH[2]}" raw_pass="${BASH_REMATCH[4]}" hostport="${BASH_REMATCH[5]}"
  local raw_db="${BASH_REMATCH[6]}" query="${BASH_REMATCH[8]}"
  [[ "$hostport" != \[* ]] || { echo "$name: IPv6 host is not supported" >&2; return 1; }
  [[ "$query" != *password=* ]] || { echo "$name: password= in the query is not supported; put it in the userinfo" >&2; return 1; }

  PG_USER="$(pg_url_decode "$raw_user")" || { echo "$name: user has a malformed percent-escape or a raw backslash/newline" >&2; return 1; }
  PG_PASS="$(pg_url_decode "$raw_pass")" || { echo "$name: password has a malformed percent-escape or a raw backslash/newline" >&2; return 1; }
  PG_DB="$(pg_url_decode "$raw_db")" || { echo "$name: database name has a malformed percent-escape or a raw backslash/newline" >&2; return 1; }
  if [[ "$hostport" == *:* ]]; then
    PG_HOST="${hostport%:*}"
    PG_PORT="${hostport##*:}"
  else
    PG_HOST="$hostport"
    PG_PORT=""
  fi
  PG_QUERY="$query"
  PG_CONN_BASE="postgresql://${raw_user}@${hostport}"
  PG_CONN="$PG_CONN_BASE/${raw_db}${query:+?$query}"
}

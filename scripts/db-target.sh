# Shared by scripts/db-setup.sh and githooks/pre-push (TASK-MVBFDSUSE5QCY).
# POSIX sh, sourced, not run. The password never leaves these functions:
# db_target prints host:port/db or a fixed placeholder, and db_is_local refuses
# any URL whose host can be overridden by a query parameter (libpq reads
# ?host=, ?hostaddr= and ?service= before the authority).

# DATABASE_URL from a .env file, without a surrounding pair of " or ' quotes.
db_env_value() {
  sed -n 's/^DATABASE_URL=//p' "$1" | tail -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# host:port/db. -n with p: a URL that does not match prints nothing, so the
# input is never echoed back (fail closed).
db_target() {
  _t=$(printf '%s' "$1" | sed -nE 's#^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*@)?([^/?@]*)/?([^?]*).*#\2/\3#p')
  printf '%s\n' "${_t:-<ayrıştırılamadı>}"
}

# Exit 0 only for a single localhost host with no host-overriding query parameter.
# Fail closed: any % in the query may hide a key (?h%6fst=), and a comma in the
# host means a multi-host list (libpq tries the next host when localhost is down).
db_is_local() {
  _lc=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$_lc" in
    *[?\&]host=*|*[?\&]hostaddr=*|*[?\&]service=*) return 1 ;;
    *\?*%*) return 1 ;;
  esac
  case "${2:-}" in
    *,*) return 1 ;;
  esac
  case "${2:-}" in
    localhost|localhost:*|127.0.0.1|127.0.0.1:*|\[::1\]|\[::1\]:*) return 0 ;;
  esac
  return 1
}

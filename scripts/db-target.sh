# Shared by scripts/db-setup.sh and githooks/pre-push (TASK-MVBFDSUSE5QCY).
# POSIX sh, sourced, not run. The password never leaves these functions:
# db_target prints host:port/db or a fixed placeholder, and db_is_local refuses
# any URL whose host can be overridden by a query parameter (libpq reads
# ?host=, ?hostaddr= and ?service= before the authority).

# DATABASE_URL from a .env file, without a surrounding pair of " or ' quotes.
db_env_value() {
  sed -n 's/^DATABASE_URL=//p' "$1" | tail -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# host:port/db or the placeholder. Fail closed in two places: a / ? or # before
# the last @ means the password has a character that splits the URL differently
# (user:pa#ss@host would print "user:pa#ss"), and whatever is left must match a
# strict host[:port]/db shape before it is printed.
db_target() {
  _rest=$(printf '%s' "$1" | sed -nE 's#^[A-Za-z][A-Za-z0-9+.-]*://(.*)$#\1#p')
  case "$_rest" in
    *@*)
      _ui=${_rest%@*}
      case "$_ui" in
        *[/?#]*) _rest= ;;
        *) _rest=${_rest##*@} ;;
      esac ;;
  esac
  _hp=${_rest%%[/?#]*}
  _db=${_rest#"$_hp"}
  _db=${_db#/}
  _db=${_db%%[?#]*}
  if [ -n "$_hp" ] \
    && printf '%s' "$_hp" | grep -Eq '^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9._-]+)(:[0-9]+)?$' \
    && printf '%s' "$_db" | grep -Eq '^[A-Za-z0-9._-]*$'; then
    printf '%s/%s\n' "$_hp" "$_db"
  else
    printf '%s\n' "<ayrıştırılamadı>"
  fi
}

# Exit 0 when the query part can replace the database name db_target prints:
# libpq reads ?dbname= (and a ?service= entry may set dbname) over the path.
# Fail closed like db_is_local: a % in the query may hide a key (?db%6eame=).
db_name_overridable() {
  _lc=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$_lc" in
    *[?\&]dbname=*|*[?\&]service=*) return 0 ;;
    *\?*%*) return 0 ;;
  esac
  return 1
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

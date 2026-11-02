#!/usr/bin/env bash
# FO-375 — applies prisma/mysql/init.sql to a MariaDB database that must be empty.
#
#   MYSQL_PWD=... scripts/mysql-schema/apply.sh --reset     # drop + create the scratch DB, then apply
#   MYSQL_PWD=... scripts/mysql-schema/apply.sh             # apply to an existing empty DB
#   scripts/mysql-schema/apply.sh --down                    # drop every table init.sql creates
#
# Env (no secrets in the repo; the password is read from MYSQL_PWD only):
#   MYSQL_HOST (127.0.0.1)  MYSQL_PORT (3306)  MYSQL_USER (root)  MYSQL_DATABASE (fabrika_faz1)
#
# Connection: strict SQL mode, UTC session time zone (FO-375 decision).
# --reset / --down refuse any host other than 127.0.0.1 / localhost: they are for scratch DBs only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${MYSQL_HOST:-127.0.0.1}"
PORT="${MYSQL_PORT:-3306}"
USER_NAME="${MYSQL_USER:-root}"
DB="${MYSQL_DATABASE:-fabrika_faz1}"
MODE="${1:-apply}"
SQL_MODE='STRICT_ALL_TABLES,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY'

# MYSQL_DOCKER_CONTAINER=<name>: run the client INSIDE that container (its own mariadb binary,
# password taken from the container's MARIADB_ROOT_PASSWORD, never leaves the container).
# Use it when the host client cannot load the auth plugin the server uses.
SESSION_INIT="SET SESSION sql_mode='${SQL_MODE}', time_zone='+00:00'"

if [[ -n "${MYSQL_DOCKER_CONTAINER:-}" ]]; then
  client() {
    # Arguments travel as positionals ($0 = session init, $@ = client args), never spliced into the
    # shell string, so SQL backticks and semicolons reach the client untouched.
    docker exec -i "$MYSQL_DOCKER_CONTAINER" sh -c \
      'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --init-command="$0" "$@"' "$SESSION_INIT" "$@"
  }
else
  if ! command -v mysql >/dev/null 2>&1; then
    echo "mysql client not found (install it, or set MYSQL_DOCKER_CONTAINER)" >&2
    exit 1
  fi
  client() {
    mysql --protocol=TCP -h "$HOST" -P "$PORT" -u "$USER_NAME" --init-command="$SESSION_INIT" "$@"
  }
fi

refuse_remote() {
  case "$HOST" in
    127.0.0.1 | localhost) ;;
    *) echo "refusing $MODE on non-local host: $HOST" >&2; exit 1 ;;
  esac
}

case "$MODE" in
  --reset)
    refuse_remote
    client -e "DROP DATABASE IF EXISTS \`${DB}\`; CREATE DATABASE \`${DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;"
    client "$DB" < "$ROOT/prisma/mysql/init.sql"
    ;;
  --down)
    refuse_remote
    client "$DB" < "$ROOT/prisma/mysql/init.down.sql"
    ;;
  apply | "")
    client "$DB" < "$ROOT/prisma/mysql/init.sql"
    ;;
  *)
    echo "usage: $0 [--reset|--down]" >&2
    exit 2
    ;;
esac

if [[ -n "${MYSQL_DOCKER_CONTAINER:-}" ]]; then
  echo "ok: $MODE on $DB (container $MYSQL_DOCKER_CONTAINER)"
else
  echo "ok: $MODE on $DB ($HOST:$PORT)"
fi

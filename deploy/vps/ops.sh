#!/usr/bin/env bash
# Canlı kümede tek seferlik veritabanı işleri (RUNBOOK §4). Her biri idempotent.
#
#   deploy/vps/ops.sh push       # prisma db push — YALNIZ boş veritabanı; canlıda önce RUNBOOK §4 diff kontrolü
#   deploy/vps/ops.sh rls-role   # fabrika_app rolü + grant (scripts/setup-rls-role.ts)
#   deploy/vps/ops.sh rls        # RLS politikaları (scripts/apply-rls.ts)
#   deploy/vps/ops.sh migrate    # prisma/migrations, apply-order.txt sırasıyla (psql, host üzerinde)
#   deploy/vps/ops.sh seed       # prisma/seed.ts — DEMO KİRACI DAHİL (RUNBOOK §4'e bak)
#   deploy/vps/ops.sh verify     # RLS canlı doğrulama (scripts/check-rls-live.ts --require-db)
#
# tsx adımları worker imajında, --network host ile koşar: postgres 127.0.0.1:5432'ye
# yayınlanmış olduğu için DATABASE_URL içindeki `postgres` ana bilgisayarı 127.0.0.1'e çevrilir.
# Şifre komut satırına GİRMEZ: URL yalnız konteyner ortamında dönüştürülür.
# Migrate psql ister; worker imajında psql yok, bu yüzden host psql (PGDG 16) kullanılır.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f deploy/vps/docker-compose.prod.yml)
ENV_FILE=deploy/vps/.env.prod
[ -f "$ENV_FILE" ] || { echo "ops: $ENV_FILE yok" >&2; exit 1; }

# Ana bilgisayarı çevir; şifre ve diğer parçalar olduğu gibi kalır.
localize='s#@postgres:#@127.0.0.1:#'
run_in_worker() {
  "${COMPOSE[@]}" run --rm --no-deps --network host worker sh -c \
    'export DATABASE_URL="$(printf %s "$DATABASE_URL" | sed "'"$localize"'")";
     if [ -n "${DATABASE_URL_RLS_TEST:-}" ]; then
       export DATABASE_URL_RLS_TEST="$(printf %s "$DATABASE_URL_RLS_TEST" | sed "'"$localize"'")";
     fi;
     exec "$@"' sh "$@"
}

case "${1:-}" in
  push)     run_in_worker node_modules/.bin/prisma db push --skip-generate ;;
  rls-role) run_in_worker node_modules/.bin/tsx scripts/setup-rls-role.ts ;;
  rls)      run_in_worker node_modules/.bin/tsx scripts/apply-rls.ts ;;
  seed)     run_in_worker node_modules/.bin/tsx prisma/seed.ts ;;
  verify)   run_in_worker node_modules/.bin/tsx scripts/check-rls-live.ts --require-db ;;
  migrate)
    # Host psql: .env.prod'dan DATABASE_URL okur (dosyayı source etmeden, şifreyi ekrana basmadan).
    url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
    url="$(printf %s "$url" | sed -E 's/@postgres:/@127.0.0.1:/; s/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"
    [ -n "$url" ] || { echo "ops: DATABASE_URL boş" >&2; exit 1; }
    DATABASE_URL="$url" scripts/apply-migrations.sh
    ;;
  *)
    echo "kullanım: $0 {push|rls-role|rls|migrate|seed|verify}" >&2
    exit 2
    ;;
esac

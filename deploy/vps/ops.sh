#!/usr/bin/env bash
# Canlı kümede tek seferlik veritabanı işleri (RUNBOOK §4). Her biri idempotent.
#
#   deploy/vps/ops.sh bootstrap  # sahip ve jobs rolleri, pgvector (YALNIZ ilk kurulum; postgres süper kullanıcısı)
#   deploy/vps/ops.sh push       # prisma db push — sahip rol; YALNIZ boş veritabanı; canlıda önce RUNBOOK §4 diff kontrolü
#   deploy/vps/ops.sh rls-role   # fabrika_app rolü + grant (scripts/setup-rls-role.ts) — sahip rol
#   deploy/vps/ops.sh rls        # RLS politikaları (scripts/apply-rls.ts) — sahip rol
#   deploy/vps/ops.sh migrate    # prisma/migrations, apply-order.txt sırasıyla (psql, host üzerinde) — sahip rol
#   deploy/vps/ops.sh seed       # prisma/seed.ts — SEED_DEMO=false (RUNBOOK §4 adım 6, K3)
#   deploy/vps/ops.sh verify     # RLS canlı doğrulama (scripts/check-rls-live.ts --require-db) — uygulama rolü
#
# Roller: sahip (fabrika_owner) OWNER_DATABASE_URL ile bağlanır; DATABASE_URL o adımlarda
# sahip URL'iyle değiştirilir. verify DATABASE_URL'i (fabrika_app) olduğu gibi kullanır; satır
# beklentisini ise OWNER_DATABASE_URL'den (BYPASSRLS sahip) ölçer — uygulama rolü 0 satır görür.
# worker imajı compose ağında koşar: servis adı `postgres` çözülür, --network host ve URL
# dönüşümü yok. Host psql'i (migrate, bootstrap) 127.0.0.1:5432'yi (loopback'e yayınlı) kullanır.
# Parolalar komut satırına GİRMEZ: konteyner ortamında (env_file) ya da stdin üzerinden gider.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f deploy/vps/docker-compose.prod.yml)
ENV_FILE=deploy/vps/.env.prod
[ -f "$ENV_FILE" ] || { echo "ops: $ENV_FILE yok" >&2; exit 1; }

die() { echo "ops: $*" >&2; exit 1; }

# .env.prod'dan tek bir değer okur (dosya source edilmez; değer ekrana basılmaz).
env_value() { grep -E "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- || true; }

# postgresql://user:parola@host/... içinden parolayı çıkarır, yüzde-kodunu çözer (yalnız çekirdek perl).
pw_from_url() {
  local rest="${1#*://}"
  rest="${rest#*:}"
  rest="${rest%%@*}"
  printf %s "$rest" | perl -pe 's/%([0-9A-Fa-f]{2})/chr(hex($1))/ge'
}

# worker konteyneri (compose ağında, --no-deps). $1 = owner | app; kalanı komut.
# owner: DATABASE_URL, konteynerdeki OWNER_DATABASE_URL ile değiştirilir (env_file'dan gelir).
# app:   DATABASE_URL olduğu gibi kalır (fabrika_app).
worker_run() {
  local role="$1"
  shift
  "${COMPOSE[@]}" run --rm --no-deps worker sh -c \
    'export SEED_DEMO=false; if [ "$1" = owner ]; then export DATABASE_URL="$OWNER_DATABASE_URL"; fi; shift; exec "$@"' \
    sh "$role" "$@"
}

case "${1:-}" in
  bootstrap)
    owner_pw="$(pw_from_url "$(env_value OWNER_DATABASE_URL)")"
    jobs_pw="$(pw_from_url "$(env_value JOBS_DATABASE_URL)")"
    [ -n "$owner_pw" ] && [ -n "$jobs_pw" ] || die "OWNER_DATABASE_URL / JOBS_DATABASE_URL içinde parola yok"
    case "$owner_pw$jobs_pw" in *\'*|*\\*) die "parolada tek tırnak ya da ters eğik çizgi olamaz (psql \\set)";; esac
    # Parolalar stdin'den gider; süper kullanıcı soket üzerinden (konteyner içi, parola gerekmez).
    { printf "\\set owner_pw '%s'\n" "$owner_pw"
      printf "\\set jobs_pw '%s'\n" "$jobs_pw"
      cat deploy/vps/bootstrap-roles.sql; } \
      | "${COMPOSE[@]}" exec -T postgres psql -U fabrika -d fabrika -X -q -v ON_ERROR_STOP=1 -f -
    ;;
  push)     worker_run owner node_modules/.bin/prisma db push ;;
  rls-role)
    [ -n "$(env_value DATABASE_URL_RLS_TEST)" ] || die "DATABASE_URL_RLS_TEST boş (scripts/setup-rls-role.ts parolayı oradan alır)"
    worker_run owner node_modules/.bin/tsx scripts/setup-rls-role.ts ;;
  rls)      worker_run owner node_modules/.bin/tsx scripts/apply-rls.ts ;;
  seed)
    # Demo ayrımı (SEED_DEMO) prisma/seed.ts'te henüz yok: FO-251. O birleşmeden seed canlıda
    # demo kiracı yazar, bu yüzden betik kapıyı kapatır.
    grep -q 'SEED_DEMO' prisma/seed.ts || die "prisma/seed.ts SEED_DEMO'yu desteklemiyor (FO-251 birleşmeden canlıda seed çalıştırılmaz)"
    worker_run owner node_modules/.bin/tsx prisma/seed.ts ;;
  verify)   worker_run app node_modules/.bin/tsx scripts/check-rls-live.ts --require-db ;;
  migrate)
    # Host psql: sahip URL'i (OWNER_DATABASE_URL) okur; dosyayı source etmez, şifreyi ekrana basmaz.
    url="$(env_value OWNER_DATABASE_URL)"
    url="$(printf %s "$url" | sed -E 's/@postgres:/@127.0.0.1:/; s/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"
    [ -n "$url" ] || die "OWNER_DATABASE_URL boş"
    DATABASE_URL="$url" scripts/apply-migrations.sh
    ;;
  *)
    echo "kullanım: $0 {bootstrap|push|rls-role|rls|migrate|seed|verify}" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
# `pnpm gate` on a throwaway Postgres, with CI's test environment (FO-165, P0-1).
# Recipe and background: docs/GATE.md.
#
#   pnpm gate:isolated                          # runs `pnpm gate`
#   pnpm gate:isolated git push -u origin <br>  # runs the command instead; the
#                                               # pre-push hook's gate gets this env
#
# Why: `pnpm gate` against the shared :5433 database went red on things that
# were not code (FO-161 report, "Gate sırasında düzeltilen ortam sorunları"):
# fabrika_app's password not matching this checkout's .env (28P01), no
# DATABASE_URL_RLS_TEST, the MinIO test-public bucket missing, blank SMTP/R2
# test values, :3000 taken by another server, and `next dev` rewriting
# tsconfig.json. This script takes each of those off the table:
#
#   1. A new pgvector/pgvector:pg16 container (CI's image) on a free port, so
#      fabrika_app is created fresh with a known throwaway password, as in CI.
#   2. `pnpm db:setup` (scripts/db-setup.sh), the path CI takes.
#   3. MinIO buckets test-evidence + test-public (`pnpm storage:setup`).
#   4. CI's R2 test values (MinIO); the e2e port is picked by gate-lock.mjs after the lock (FO-388).
#      SMTP/mailpit come from playwright.config.ts.
#   5. `pnpm gate` (gate-lock + gate:core), unchanged.
#   6. tsconfig.json restored if it was clean before and `next dev` rewrote it.
#
# Needs: docker, pnpm, a MinIO on R2_ENDPOINT (default http://localhost:9000,
# `pnpm storage:up`) and a mailpit on :1025/:8025 (docker-compose.yml).
# Values set here win over ./.env (vitest and playwright give the process
# environment precedence), so a checkout's own .env does not leak in.
#
# Env (all optional):
#   GATE_PG_PORT   host port for the container   (default: first free from 55400)
#   E2E_PORT       port for the e2e next server   (default: first free from 3400, picked AFTER the
#                  gate lock is taken; set it only to pin a port: a busy one fails at once)
#   GATE_KEEP=1    keep the container afterwards (prints its name)
#
# Every credential here is a local throwaway, the same ones ci.yml uses.
# Nothing touches a shared or production database.
# Rollback: delete this file and the `gate:isolated` script line.
set -euo pipefail

cd "$(dirname "$0")/.."

log() { printf '%s [gate-isolated] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAIL: $*" >&2; exit 1; }

# FO-339: aynı tree için yeşil kayıt (önbellek) ya da yalnız belge farkı varsa konteyner/DB kurmadan
# `pnpm gate` koşulur; karar ve satır scripts/gate-lock.mjs'te verilir. Komut verilmişse atlanmaz.
# NG-72: FONBRIDGE_GATE_NO_CACHE=1 iken gate-cache.mjs skippable 1 döner, yani kısa yol hiç denenmez.
# NG-72 (fail-closed): kısa yol YALNIZ pozitif mesajla alınır (önbellek: / belge-yalnız:). Boş çıktı + rc=0
# (örn. gate-cache.mjs CLI koruması eşleşmediğinde) ya da başka her çıktı izole tam gate'e düşer.
if [ $# -eq 0 ]; then
  skip_msg="$(node scripts/gate-cache.mjs skippable || true)"
  case "$skip_msg" in
    önbellek:*|belge-yalnız:*)
      log "kısa yol: $skip_msg; izole DB kurulmadan pnpm gate"
      exec pnpm gate
      ;;
  esac
fi

command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
command -v pnpm >/dev/null 2>&1 || fail "pnpm not found on PATH"

port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
first_free() {
  local p=$1
  while ! port_free "$p"; do p=$((p + 1)); done
  printf '%s\n' "$p"
}

# FO-397: önceki sürüm boş portu burada seçip `docker run -p` ile bağlıyordu; iki koşu aynı boş portu
# görüp ikisi de bağlamaya çalışınca "port is already allocated" (GATE_EXIT=125). Artık varsayılan yol
# Docker'ın portu atomik olarak seçmesi (`-p 127.0.0.1::5432`), gerçek port `docker port` ile okunur.
# GATE_PG_PORT verilirse o port elle istenmiştir ve kontrol edilir (yarış penceresi kabul edilmiş).
pg_port=""
if [ -n "${GATE_PG_PORT:-}" ]; then
  port_free "$GATE_PG_PORT" || fail "GATE_PG_PORT $GATE_PG_PORT is in use"
  pg_publish="127.0.0.1:$GATE_PG_PORT:5432"
else
  pg_publish="127.0.0.1::5432"
fi
# FO-388: the e2e port is NOT picked here. scripts/gate-lock.mjs picks it after the gate lock is
# taken, before any test step: a port picked here sat unused through the whole queue wait, and
# another run took it. An explicit E2E_PORT is checked now and again after the lock.
if [ -n "${E2E_PORT:-}" ]; then
  port_free "$E2E_PORT" || fail "E2E_PORT $E2E_PORT is in use"
  e2e_desc="E2E_PORT=$E2E_PORT, elle verilmiş"
else
  export FONBRIDGE_E2E_PORT_AUTO=1
  unset E2E_PORT
  # FO-388 (3. inceleme): a command given as arguments that is not `pnpm gate` takes no gate lock, so it
  # gets a port now. The pre-pick is marked FONBRIDGE_E2E_PORT_PREPICK: gate-lock.mjs treats a value with
  # that mark as the script's own and ignores it silently (a `git push` runs `pnpm gate` in its hook, which
  # takes the lock and picks again). Without the mark it would look like a manual E2E_PORT and warn.
  if [ $# -gt 0 ]; then
    pick="$(first_free 3400)"
    export FONBRIDGE_E2E_PORT_PREPICK="$pick"
    export E2E_PORT="$pick"
  fi
  e2e_desc="E2E_PORT kilit alındıktan sonra seçilir"
fi

# Test hook: print the e2e decision and stop before any container or database work.
if [ "${GATE_ISOLATED_DRY_RUN:-0}" = 1 ]; then
  log "dry-run e2e: auto=${FONBRIDGE_E2E_PORT_AUTO:-} e2e_port=${E2E_PORT:-} prepick=${FONBRIDGE_E2E_PORT_PREPICK:-} ($e2e_desc)"
  exit 0
fi

# FO-397: node_modules sembolik bağ ise Turbopack `next/package.json`'ı bulamaz, her sayfa 500 döner ve
# e2e web sunucusu 180 sn sonra zaman aşımına uğrar. Konteyner kurulmadan önce açık hatayla dur.
if [ -L node_modules ]; then
  fail "node_modules sembolik bağ ($(readlink node_modules)); gerçek kurulum gerekli: pnpm install --frozen-lockfile"
fi

container="fabrika-gate-$(date -u +%Y%m%d%H%M%S)-$$"
# Not `fabrika`: tests/expert-prereg-retention.live.test.ts skips itself on a
# database of that name (it takes it for the shared one; CLAUDE.md).
db=fabrika_gate

tsconfig_was_clean=0
git diff --quiet -- tsconfig.json 2>/dev/null && tsconfig_was_clean=1

# FO-385: how the e2e server ended, printed last so it sits next to the failure summary.
diag_file="$(mktemp -t fabrika-e2e-server-diag.XXXXXX)"
export E2E_SERVER_DIAG_FILE="$diag_file"

# FO-397 teşhis: DB'ye ulaşılamadığında (e2e ortasında "Can't reach database server") konteynerin neden
# durduğunu tek satırda yaz. Çalışıyorsa "düşmedi" kanıtıdır; durmuşsa çıkış kodu ve OOM bilgisi verir.
db_diag() {
  docker inspect "$container" >/dev/null 2>&1 || { log "db teşhis: $container yok (kaldırılmış ya da hiç başlamadı)"; return 0; }
  local st
  st="$(docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} finished={{.State.FinishedAt}} error={{.State.Error}}' "$container")"
  if docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
    log "db teşhis: $container ÇALIŞIYOR ($st) — konteyner düşmedi; bağlantı hatası ağ/yük tarafında"
  else
    log "db teşhis: $container DURMUŞ ($st) — neden: exit kodu ve oom alanına bak"
  fi
}

cleanup() {
  local rc=$?
  if grep -q '\] {' "$diag_file" 2>/dev/null; then
    log "e2e server diagnostics (what this means: docs/GATE.md, FO-385):"
    grep '\] {' "$diag_file" || true
  fi
  rm -f "$diag_file"
  if [ "$tsconfig_was_clean" = 1 ] && ! git diff --quiet -- tsconfig.json 2>/dev/null; then
    git checkout -- tsconfig.json && log "tsconfig.json restored (next dev rewrote it)"
  fi
  if [ "$rc" -ne 0 ] && [ -n "$pg_port" ]; then db_diag; fi
  if [ "${GATE_KEEP:-0}" = 1 ]; then
    log "kept container $container (port $pg_port); remove: docker rm -f $container"
  else
    docker rm -f "$container" >/dev/null 2>&1 && log "removed container $container"
  fi
  exit "$rc"
}
trap cleanup EXIT

log "starting $container (publish $pg_publish)"
docker run -d --name "$container" -p "$pg_publish" \
  -e POSTGRES_DB="$db" -e POSTGRES_USER=fabrika -e POSTGRES_PASSWORD=fabrika \
  pgvector/pgvector:pg16 >/dev/null
if [ -n "${GATE_PG_PORT:-}" ]; then
  pg_port="$GATE_PG_PORT"
else
  pg_port="$(docker port "$container" 5432 | head -1 | sed 's/.*://')"
fi
[ -n "$pg_port" ] || fail "no host port for $container"
log "$container listens on 127.0.0.1:$pg_port"
for i in $(seq 1 60); do
  docker exec "$container" pg_isready -U fabrika -d "$db" >/dev/null 2>&1 && break
  [ "$i" = 60 ] && fail "postgres did not become ready"
  sleep 1
done
# pg_isready answers during the image's init restart; wait for a real query.
for i in $(seq 1 30); do
  docker exec "$container" psql -U fabrika -d "$db" -Atc 'select 1' >/dev/null 2>&1 && break
  [ "$i" = 30 ] && fail "postgres does not accept queries"
  sleep 1
done

# ci.yml job env.
export DATABASE_URL="postgresql://fabrika:fabrika@127.0.0.1:$pg_port/$db"
export DATABASE_URL_RLS_TEST="postgresql://fabrika_app:fabrika_app_ci@127.0.0.1:$pg_port/$db"
# ci.yml Test step. KEEP_EU_LIVE=1 runs keep-eu-sync.live against this throwaway DB.
export AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment'
export KEEP_EU_LIVE=1
# NG-40: buyer tax-number field encryption (src/lib/billing/tax-id-crypto.ts). A throwaway
# 32-byte key of this gate, the same kind of fixture as AUTH_SECRET above - not for any deployment.
export TAX_ID_ENCRYPTION_KEY="${TAX_ID_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
# FO-256: the pool's 1 s connect timeout failed under load (FO-253). Here, and only
# here, it gets 10 s; prod and dev keep 1000 ms (src/lib/env.ts). Vitest and the
# Playwright webServer both inherit this environment.
export DB_CONNECT_TIMEOUT_MS=10000
# ci.yml E2E step: R2 -> local MinIO, so admin-blog-image-upload.spec runs
# instead of skipping. Exported for the whole gate (gate:core is one chain).
# SMTP, NEXT_PUBLIC_APP_URL and the e2e AUTH_SECRET are NOT set here:
# playwright.config.ts gives them to the e2e server only, and the vitest step
# must run without SMTP (a live test asserts the no-SMTP invite answer).
export R2_ACCOUNT_ID=ci-minio
export R2_ENDPOINT="${R2_ENDPOINT:-http://localhost:9000}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-minioadmin}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-minioadmin}"
export R2_BUCKET=test-evidence
export R2_PUBLIC_BUCKET=test-public
export R2_PUBLIC_HOST="$R2_ENDPOINT/test-public"

# Wall-clock budgets of the timing tests (tests/helpers/timing.ts) scale with the
# load: 1 on an idle machine, ceil(2 * load1 / cpus) under load. The 1-minute average
# lags the parallel tests it is measuring, hence the 2x. A value set by the
# caller wins. Behaviour assertions do not depend on it (FO-261).
cpus=$(sysctl -n hw.ncpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)
if [ -r /proc/loadavg ]; then load1=$(cut -d' ' -f1 /proc/loadavg); else load1=$(sysctl -n vm.loadavg | awk '{print $2}'); fi
export TEST_TIMING_SLACK="${TEST_TIMING_SLACK:-$(awk -v l="$load1" -v c="$cpus" 'BEGIN { r = l / c; r = 2 * r; s = (r <= 1) ? 1 : int(r) + (r > int(r)); printf "%d", s }')}"
log "TEST_TIMING_SLACK=$TEST_TIMING_SLACK (load1 $load1, $cpus cpus)"

log "db:setup on 127.0.0.1:$pg_port/$db"
pnpm db:setup

log "MinIO buckets on $R2_ENDPOINT"
pnpm storage:setup

if [ $# -gt 0 ]; then
  log "$* ($e2e_desc)"
  "$@"
  log "ok: $1 finished on an isolated database"
else
  log "pnpm gate ($e2e_desc)"
  pnpm gate
  log "ok: gate green on an isolated database"
fi

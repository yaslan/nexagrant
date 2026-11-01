#!/bin/bash
# FonBridge scheduled-job worker for cPanel Cron Jobs (TASK-MUST2PP2NHP6L).
#
# Passenger runs only the web app; the graphile-worker (ADR-0008) is a
# long-running process of its own. cPanel cannot run a service, so a cron
# entry starts this script every minute: if a worker is already running it
# exits at once (flock), otherwise it starts one. A worker killed by the host
# is back within a minute; missed cron ticks are filled on start (fill=6h/1d,
# src/lib/jobs/schedule.ts).
#
#   * * * * * /bin/bash /home/fonbridge/fonbridge-app/worker.sh
#
# Environment: the variables set in "Setup Node.js App" do NOT reach cron.
# The worker reads its own file (default ~/.fonbridge-worker.env, chmod 600,
# outside the application root) through dotenv. It must hold at least
# DATABASE_URL and JOBS_CRON_ENABLED (true|false); production refuses to start
# without JOBS_CRON_ENABLED.
#
# Node: FB_NODE, else the Node.js Selector's virtual environment, else `node`.
#
#   worker.sh stop   SIGTERM to this app's worker: it finishes the jobs in flight
#                    and exits; the next cron minute starts a fresh one (that is
#                    also how a changed env file is picked up).
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${FB_WORKER_ENV:-$HOME/.fonbridge-worker.env}"
LOG_DIR="${FB_WORKER_LOG_DIR:-$HOME/fonbridge-logs}"
LOG="$LOG_DIR/worker.log"
LOCK="$APP_ROOT/tmp/worker.lock"

mkdir -p "$LOG_DIR" "$APP_ROOT/tmp"

if [ "${1:-}" = "stop" ]; then
  if pkill -TERM -u "$(id -u)" -f "$APP_ROOT/app/jobs-worker.cjs"; then
    echo "$(date -u +%FT%TZ) worker.sh: stop requested (SIGTERM)" >> "$LOG"
  else
    echo "$(date -u +%FT%TZ) worker.sh: stop: no worker running" >> "$LOG"
  fi
  exit 0
fi

if [ -z "${FB_NODE:-}" ]; then
  FB_NODE="$(ls -d "$HOME"/nodevenv/"$(basename "$APP_ROOT")"/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$FB_NODE" ] || FB_NODE="$(command -v node || true)"
fi
if [ -z "$FB_NODE" ] || [ ! -x "$FB_NODE" ]; then
  echo "$(date -u +%FT%TZ) worker.sh: no node binary (set FB_NODE)" >> "$LOG"; exit 1
fi
if [ ! -r "$ENV_FILE" ]; then
  echo "$(date -u +%FT%TZ) worker.sh: env file $ENV_FILE missing" >> "$LOG"; exit 1
fi

# Keep the log under ~20 MB (one old copy).
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 10485760 ]; then
  mv -f "$LOG" "$LOG.1"
fi

cd "$APP_ROOT/app"
export NODE_ENV=production DOTENV_CONFIG_PATH="$ENV_FILE"
# -n: another worker holds the lock → exit 0 quietly (the normal case every minute).
exec flock -n -E 0 "$LOCK" "$FB_NODE" "$APP_ROOT/app/jobs-worker.cjs" >> "$LOG" 2>&1

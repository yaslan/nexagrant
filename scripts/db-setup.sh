#!/usr/bin/env bash
# Build a local or CI database from empty, in the one order that works
# (TASK-MVBFDSUSE5QCY). `.github/workflows/ci.yml` "Prepare database" calls this
# script, so a laptop, a worktree and CI take the same path.
#
#   0. pnpm db:generate                    Prisma client for the tsx steps (a fresh worktree has none)
#   1. .github/ci/supabase-ensure-rls.sql  live's ensure_rls event trigger: every new table starts RLS on
#   2. prisma db push                      base tables from schema.prisma (no migration creates them)
#   3. pnpm db:rls-role                    fabrika_app; needs the tables, must exist before db:rls grants to it
#   4. pnpm db:rls                         policies + DISABLE loop, so the migrations' postflight passes
#   5. scripts/apply-migrations.sh         prisma/migrations in apply-order.txt order
#   6. pnpm db:rls                         again, for the tables and columns the migrations added
#   7. pnpm db:seed                        plans, module catalogue, demo tenant
#
# Why not `prisma migrate deploy`: prisma/migrations is not a Prisma Migrate
# history. Prisma sees only the six folder migrations, and add-m10 then fails on
# an empty database with `relation "FollowupDoc" does not exist`, leaving a
# half-applied database behind. prisma.config.ts refuses migrate deploy/dev/reset
# for that reason.
#
# Every step is idempotent; running the script twice must exit 0 both times
# (CI runs it twice). Local and CI only: the ensure_rls trigger needs a
# superuser and production already has its own, so a non-local host is refused.
# Production follows docs/RELEASE_CHECKLIST.md §3.1.
#
# Usage:
#   pnpm db:setup                                   # DATABASE_URL from the environment, else ./.env
#   DATABASE_URL=postgresql://... pnpm db:setup
#
# Env: DATABASE_URL, PSQL (psql binary, default `psql`).
# Rollback: it is a throwaway database. Drop it (or the container) and rerun.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/db-target.sh
. scripts/db-target.sh

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(db_env_value .env)
fi
: "${DATABASE_URL:?DATABASE_URL is not set and ./.env has none}"
export DATABASE_URL

# host:port/db, never the password (scripts/db-target.sh).
target=$(db_target "$DATABASE_URL")
if ! db_is_local "$DATABASE_URL" "${target%%/*}"; then
  echo "db-setup: refusing $target: only a local or CI database (localhost, no host= / hostaddr= / service= in the URL). Production: docs/RELEASE_CHECKLIST.md §3.1." >&2
  exit 1
fi

# psql rejects Prisma's `?schema=` parameter (same as apply-migrations.sh).
psql_url=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')
psql_bin=${PSQL:-psql}

step() { echo "db-setup: [$1/7] $2"; }

echo "db-setup: target $target"
step 0 "db:generate"
pnpm db:generate
step 1 "ensure_rls event trigger"
"$psql_bin" "$psql_url" -X -q -v ON_ERROR_STOP=1 -f .github/ci/supabase-ensure-rls.sql
step 2 "prisma db push"
pnpm exec prisma db push
step 3 "db:rls-role"
pnpm db:rls-role
step 4 "db:rls"
pnpm db:rls
step 5 "apply-migrations"
PSQL=$psql_bin scripts/apply-migrations.sh
step 6 "db:rls"
pnpm db:rls
step 7 "db:seed"
pnpm db:seed
echo "db-setup: done ($target)"

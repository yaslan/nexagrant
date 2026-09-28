#!/usr/bin/env bash
# Apply every forward migration in prisma/migrations, in the order listed in
# prisma/migrations/apply-order.txt, with psql -v ON_ERROR_STOP=1.
#
# TASK-MULU7SAA4EPP8. `prisma migrate deploy` does not see the flat .sql files
# (docs/RELEASE_CHECKLIST.md §1) and `prisma db push` builds only what
# schema.prisma describes, so SECURITY DEFINER functions, CHECK constraints and
# the per-file policies exist only here. The files do not create the base
# tables (Tenant, User, ...), so on an empty database run `prisma db push`
# first; the files are idempotent and are written to run on top of it.
#
# Usage:
#   DATABASE_URL=postgresql://... scripts/apply-migrations.sh
#   scripts/apply-migrations.sh --list    # print the order, touch nothing
#
# Exits non-zero on the first failing statement, or when apply-order.txt and
# the files on disk disagree. Running it twice must also exit 0: that is the
# idempotency contract CI checks.
#
# Env: DATABASE_URL (required), PSQL (psql binary, default `psql`).
# Rollback: each file has a .down.sql (flat) or down.sql (folder) beside it;
# apply those in reverse order by hand.
set -euo pipefail

cd "$(dirname "$0")/.."
dir=prisma/migrations
order_file=$dir/apply-order.txt

listed=()
while IFS= read -r line; do
  line=${line%%#*}
  line=$(printf '%s' "$line" | tr -d '[:space:]')
  [ -n "$line" ] && listed+=("$line")
done < "$order_file"

# The list and the tree must agree, or a new migration would silently never run.
on_disk=$(cd "$dir" && { ls -1 *.sql | grep -v '\.down\.sql$'; ls -1 */migration.sql; } | sort)
in_list=$(printf '%s\n' "${listed[@]}" | sort)
if [ "$on_disk" != "$in_list" ]; then
  echo "apply-migrations: $order_file does not match the files in $dir" >&2
  diff <(printf '%s\n' "$in_list") <(printf '%s\n' "$on_disk") \
    | sed -n 's/^< /  listed, not on disk: /p; s/^> /  on disk, not listed: /p' >&2
  exit 1
fi
dupes=$(printf '%s\n' "$in_list" | uniq -d)
if [ -n "$dupes" ]; then
  echo "apply-migrations: listed more than once: $dupes" >&2
  exit 1
fi

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${listed[@]}"
  exit 0
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"
# Prisma's `?schema=` parameter is not a libpq option; psql rejects the URL with it.
url=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')
psql_bin=${PSQL:-psql}

n=0
for f in "${listed[@]}"; do
  n=$((n + 1))
  echo "==> [$n/${#listed[@]}] $f"
  "$psql_bin" "$url" -X -q -v ON_ERROR_STOP=1 -f "$dir/$f"
done
echo "apply-migrations: $n files applied"

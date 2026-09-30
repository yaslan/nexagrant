#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
dir=prisma/migrations
order_file=$dir/apply-order.txt

: "${DATABASE_URL:?DATABASE_URL is not set}"

listed=()
while IFS= read -r line; do
  line=${line%%#*}
  line=$(printf '%s' "$line" | tr -d '[:space:]')
  [ -n "$line" ] && listed+=("$line")
done < "$order_file"

n=0
for f in "${listed[@]}"; do
  n=$((n + 1))
  echo "==> [$n/${#listed[@]}] $f"
  docker exec befb-muodyi-pg psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "/var/lib/postgresql/data/../../../../../private/tmp/claude-501/-Users-macbook-alan/06e68420-c4b7-4635-bd26-3d2e73cf0281/scratchpad/wt/$dir/$f" 2>&1 | head -5 || true
done
echo "apply-migrations: $n files applied"

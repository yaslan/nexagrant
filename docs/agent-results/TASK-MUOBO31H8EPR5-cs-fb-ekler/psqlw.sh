#!/bin/bash
# psql wrapper: runs psql inside csfbo3-pg; URL host/port rewritten, -f file fed on stdin.
args=(); file=""
while [ $# -gt 0 ]; do
  case "$1" in
    postgres*://*) args+=("$(echo "$1" | sed -E 's#@127\.0\.0\.1:55983/#@localhost:5432/#')");;
    -f) file="$2"; shift;;
    *) args+=("$1");;
  esac; shift
done
if [ -n "$file" ]; then docker exec -i csfbo3-pg psql "${args[@]}" -f - < "$file"; else docker exec -i csfb101-pg psql "${args[@]}"; fi

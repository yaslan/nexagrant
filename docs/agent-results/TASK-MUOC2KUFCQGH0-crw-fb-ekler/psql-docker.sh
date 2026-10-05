#!/bin/bash
# psql shim: run the container's psql, feeding -f <file> on stdin. Args: <url> ... -f <file>
file=""; args=()
shift # url
while [ $# -gt 0 ]; do
  if [ "$1" = "-f" ]; then file=$2; shift 2; else args+=("$1"); shift; fi
done
docker exec -i crwfb-muoc2k-pg psql -U fabrika -d fabrika "${args[@]}" < "$file"

#!/bin/bash
# psql shim: runs psql inside MY container (sefb-i63-pg). Args: <url> ... -f <file>
shift; args=(); file=""
while [ $# -gt 0 ]; do if [ "$1" = "-f" ]; then file="$2"; shift 2; else args+=("$1"); shift; fi; done
exec docker exec -i sefb-i63-pg psql -U fabrika -d fabrika "${args[@]}" < "$file"

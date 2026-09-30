#!/bin/bash
# psql shim for scripts/apply-migrations.sh: runs psql inside MY container (csfb-rbac-pg).
# Args: <url> -X -q -v ON_ERROR_STOP=1 -f <file>
shift; args=(); file=""
while [ $# -gt 0 ]; do if [ "$1" = "-f" ]; then file="$2"; shift 2; else args+=("$1"); shift; fi; done
exec docker exec -i csfb-rbac-pg psql -U fabrika -d csfb_rbac "${args[@]}" < "$file"

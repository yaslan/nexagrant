#!/bin/bash
# restart MY next dev (pid file) with TRUSTED_PROXY_HOPS=$1 ("UNSET" = unset)
S=/private/tmp/claude-501/-Users-macbook-alan/f64deac7-4887-485b-9cc0-329f75bad2e8/scratchpad
kill "$(cat $S/next.pid)" 2>/dev/null; for i in $(seq 1 20); do lsof -iTCP:3961 -sTCP:LISTEN >/dev/null || break; sleep 0.5; done
cd $S/wt61; set -a; source .env; set +a; export DEMO_LOGIN_ENABLED=false
if [ "$1" = "UNSET" ]; then unset TRUSTED_PROXY_HOPS; else export TRUSTED_PROXY_HOPS="$1"; fi
nohup npx next dev -p 3961 > $S/next-$1.log 2>&1 & echo $! > $S/next.pid
curl -s -o /dev/null -w "restarted hops=$1 GET=%{http_code}\n" --max-time 180 --retry 30 --retry-all-errors --retry-delay 1 'http://localhost:3961/tr/fon-hazirlik'

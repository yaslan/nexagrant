#!/bin/bash
# Gerçek kesinti: Workspace kilitli (findScopedWorkspace bekler), istekler askıdayken konteyner KILL.
S=$1; B=http://localhost:3590; AID=400584f6bfb34936b0c46b6dcfd6fd3ac97baebf8b
ck(){ python3 -c "import json;print(json.load(open('$S/cookies.json'))['$1'])"; }
post(){ # user label body
  local t0=$(python3 -c 'import time;print(time.time())')
  local r=$(curl -s -m 90 -X POST "$B/tr/ws-b/cagrilar/HORIZON-CL2-2026-D1-01" -H "Next-Action: $AID" -H "Origin: $B" -H "Content-Type: text/plain;charset=UTF-8" -H "Accept: text/x-component" -b "authjs.session-token=$(ck $1)" --data "$3" | grep success | cut -c1-150)
  echo "$2 ($(python3 -c "import time;print(round(time.time()-$t0,1))") sn) -> ${r:-<yanıt yok>}"
}
docker exec csfb90-pg psql -U fabrika -c 'BEGIN; LOCK TABLE "Workspace" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(60);' >/dev/null 2>&1 &
/bin/sleep 1
post restr "O1 restr slug ws-a (üyelik DIŞI)" '[{"workspaceSlug":"ws-a","title":"CSFB90-O1","topicId":"HORIZON-CL2-2026-D1-01"}]' > $S/o1.txt &
post restr "O2 restr slug ws-b (izinli)"      '[{"workspaceSlug":"ws-b","title":"CSFB90-O2"}]' > $S/o2.txt &
post restr "O3 restr slug {foo:1}"            '[{"workspaceSlug":{"foo":1},"title":"CSFB90-O3"}]' > $S/o3.txt &
post restr "O4 restr slug ws-a\\u0000"        '[{"workspaceSlug":"ws-a\u0000","title":"CSFB90-O4"}]' > $S/o4.txt &
/bin/sleep 5
echo "askıdaki backend'ler: $(docker exec csfb90-pg psql -U fabrika -tAc "select count(*) from pg_stat_activity where wait_event_type='Lock'")"
echo "KILL $(date +%T)"; docker kill csfb90-pg >/dev/null
wait
cat $S/o1.txt $S/o2.txt $S/o3.txt $S/o4.txt; rm -f $S/o[1-4].txt
echo "== DB kapalıyken yeni istekler"
post restr "O5 ws-b (DB kapalı)" '[{"workspaceSlug":"ws-b","title":"CSFB90-O5"}]'
post restr "O6 {foo:1} (DB kapalı)" '[{"workspaceSlug":{"foo":1},"title":"CSFB90-O6"}]'

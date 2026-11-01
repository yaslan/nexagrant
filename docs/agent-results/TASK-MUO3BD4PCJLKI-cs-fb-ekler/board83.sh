#!/bin/bash
S=$(dirname "$0"); B=http://localhost:3583; ck(){ python3 -c "import json;print(json.load(open('$S/cookies.json'))['$1'])"; }
AID=$(python3 -c "import json;print(json.load(open('$S/action-hdr.json'))['headers']['next-action'])")
echo "== alanı olmayan kullanıcılar: NUL / nesne slug"
for u in none t5u t6u; do for body in '"workspaceSlug":"x\u0000"' '"workspaceSlug":{"foo":1}'; do
 r=$(curl -s -X POST "$B/tr/ws-b/cagrilar/HORIZON-CL2-2026-D1-01" -H "Next-Action: $AID" -H "Origin: $B" -H "Content-Type: text/plain;charset=UTF-8" -H "Accept: text/x-component" -b "authjs.session-token=$(ck $u)" --data "[{$body,\"title\":\"CSFB83-N-$u\",\"topicId\":\"HORIZON-CL2-2026-D1-01\"}]" | grep success | cut -c1-120)
 echo "$u $body -> $r"; done; done
echo "== pano görünürlüğü (HTML'de işaretçi)"
for pair in "owner tr/ws-a/firsatlar" "owner en/ws-a/pipeline" "restr tr/ws-b/firsatlar" "alice tr/main/firsatlar"; do set -- $pair
 h=$(curl -s -b "authjs.session-token=$(ck $1)" "$B/$2"); echo "$1 /$2: $(echo "$h" | grep -o 'CSFB83-[0-9RN][0-9a-z-]*' | sort -u | tr '\n' ' ')  modül-kapalı=$(echo "$h" | grep -c 'kullanılamıyor\|not available')"; done

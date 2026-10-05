#!/bin/bash
S=$(dirname "$0"); B=http://localhost:3512; ID=HORIZON-CL5-2026-D4-01
ck(){ python3 -c "import json;print(json.load(open('$S/cookies.json'))['$1'])"; }
hop(){ curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$@" | sed "s#$B##"; }
echo "== 1. kart linkleri (girişsiz; herkese aynı)"
for p in tr/calls en/calls tr/calls/germany en/calls/germany; do
  html=$(curl -s "$B/$p"); all=$(echo "$html" | grep -Eo 'href="/(tr|en)/[^"]*(calls/topic|cagrilar|callbackUrl)[^"]*"' | sort -u)
  n=$(echo "$all" | grep -c 'calls/topic/'); bad=$(echo "$all" | grep -c 'default\|callbackUrl')
  echo "$p topic-linkleri=$n default/callbackUrl-linkleri=$bad örnek=$(echo "$all" | head -1)"
done
echo "== 2. yönlendirme rotası"
for l in tr en; do echo "girişsiz $l: $(hop $B/$l/calls/topic/$ID)"; done
for u in alice owner restr del none; do C="authjs.session-token=$(ck $u)"; for l in tr en; do echo "$u $l: $(hop -b "$C" $B/$l/calls/topic/$ID)"; done; done
echo "de/..: $(hop $B/de/calls/topic/$ID) · uzun id: $(hop "$B/tr/calls/topic/$(python3 -c 'print("x"*201)')")"
echo "== 3. detay sayfası: URL slug'ına güvenilmiyor"
for pair in "restr ws-a" "restr default" "restr ws-b" "del default" "del yeni" "owner default" "owner ws-b" "owner nope" "alice default" "alice ws-a" "none default"; do
  set -- $pair; C="authjs.session-token=$(ck $1)"; echo "$1 /tr/$2/cagrilar/$ID -> $(hop -b "$C" $B/tr/$2/cagrilar/$ID)"
done

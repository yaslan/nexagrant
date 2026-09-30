#!/bin/bash
S=/private/tmp/claude-501/-Users-macbook-alan/77ae9567-63fb-44a2-8ab4-1b0f76066c09/scratchpad
B=http://localhost:3476
ck(){ python3 -c "import json;print(json.load(open('$S/cookies76.json'))['$1'])"; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
echo "== B-1 prototip anahtarları (girişsiz)"
for l in tr en; do for k in constructor __proto__ toString hasOwnProperty valueOf isPrototypeOf propertyIsEnumerable toLocaleString __defineGetter__; do printf "%s/calls/%s %s\n" $l $k $(code "$B/$l/calls/$k"); done; done
for p in tr/calls/germany en/calls/france tr/calls/turkey tr/calls/TURKEY "tr/calls/germany%20" tr/calls/eu; do printf "%s %s\n" "$p" $(code "$B/$p"); done
echo "== B-2 girişsiz kart linkleri"
for p in tr/calls en/calls tr/calls/germany en/calls/germany; do
  html=$(curl -s "$B/$p"); links=$(echo "$html" | grep -o 'href="/[a-z][a-z]/\(giris\|login\)?callbackUrl=[^"]*"' | sort -u)
  n=$(echo "$links" | grep -c . ); old=$(echo "$html" | grep -Eo 'href="/(tr|en)/calls/[A-Z][^"]*"' | wc -l | tr -d ' ')
  codes=$(echo "$links" | sed 's/href="//;s/"$//;s/&amp;/\&/g' | while read u; do code "$B$u"; echo; done | sort | uniq -c | tr '\n' ' ')
  echo "$p distinct=$n old-style=$old codes: $codes"; echo "$links" | head -1
done
for u in alice owner restr del; do
  C="authjs.session-token=$(ck $u)"
  echo "== girişli: $u"
  html=$(curl -s -b "$C" "$B/tr/calls"); first=$(echo "$html" | grep -o 'href="/tr/[^"]*/cagrilar/[^"]*"' | head -1 | sed 's/href="//;s/"$//')
  echo "kart[0]=$first -> $(code -b "$C" "$B$first")"
  echo "distinct kart linkleri: $(echo "$html" | grep -o 'href="/tr/[^"]*/cagrilar/[^"]*"' | sort -u | wc -l | tr -d ' ')"
  det=$(curl -s -b "$C" "$B$first"); echo "detay: back=$(echo "$det" | grep -o 'href="/tr/[^"]*/cagrilar"' | head -1) sidebar-pipeline=$(echo "$det" | grep -o 'href="/tr/[^"/]*/pipeline"' | head -1) switcher=$(echo "$det" | grep -o '"slug":"[^"]*"' | sort -u | tr '\n' ' ')"
done

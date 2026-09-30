#!/bin/bash
S=$(dirname "$0"); B=http://localhost:3583; ID=HORIZON-CL5-2026-D4-01
ck(){ python3 -c "import json;print(json.load(open('$S/cookies.json'))['$1'])"; }
# zinciri izle: en çok 8 hop, döngü/uzunluk yaz
chain(){ local c="$1" u="$2" out="" n=0 code loc
  while [ $n -lt 8 ]; do
    r=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" ${c:+-b "$c"} "$u"); code=${r%% *}; loc=${r#* }
    out="$out $code"; [ "$code" != 307 ] && [ "$code" != 302 ] && [ "$code" != 303 ] && [ "$code" != 308 ] && break
    out="$out -> ${loc#$B}"; u="$loc"; n=$((n+1)); done
  [ $n -ge 8 ] && out="$out  ⚠DÖNGÜ(8+ hop)"; echo "$out"; }
echo "== A. kart linkleri (girişsiz ve girişli aynı mı)"
for p in tr/calls en/calls; do
  a=$(curl -s "$B/$p" | grep -Eo 'href="[^"]*(calls/topic|cagrilar|/default/)[^"]*"' | sort -u); b=$(curl -s -b "authjs.session-token=$(ck restr)" "$B/$p" | grep -Eo 'href="[^"]*(calls/topic|cagrilar|/default/)[^"]*"' | sort -u)
  echo "$p girişsiz topic=$(echo "$a"|grep -c calls/topic) default=$(echo "$a"|grep -c /default/) | restr aynı=$([ "$a" = "$b" ] && echo evet || echo HAYIR)"
done
echo "== B. alan-bağımsız rota: kullanıcı × dil (tam zincir)"
for u in anon alice owner restr restrc del none nomem t5u t6u t7u t8u; do for l in tr en; do
  c=""; [ $u != anon ] && c="authjs.session-token=$(ck $u)"; echo "$u $l:$(chain "$c" $B/$l/calls/topic/$ID)"; done; done
echo "== C. rota girdi kurcalama"
for p in "de/calls/topic/$ID" "tr/calls/topic/%00" "tr/calls/topic/$(python3 -c 'print("x"*200)')" "tr/calls/topic/$(python3 -c 'print("x"*201)')" "tr/calls/topic/..%2f..%2fevil" "tr/calls/topic/%2F%2Fevil.com" "tr/calls/topic/a%3Fx%3D1%23y" "TR/calls/topic/$ID" "tr/calls/topic/__proto__"; do
  echo "restr /$p:$(chain "authjs.session-token=$(ck restr)" "$B/$p" )"; done
echo "Cache-Control: $(curl -s -D- -o /dev/null -b "authjs.session-token=$(ck restr)" $B/tr/calls/topic/$ID | grep -i cache-control | tr -d '\r')"
echo "== D. detay sayfası URL slug kurcalama (tam zincir)"
for pair in "restr ws-a" "restr ws-c" "restr default" "restr WS-B" "restr ws-b" "restrc ws-c" "restrc default" "del default" "del yeni" "owner ws-c" "owner nope" "t5u silik" "t5u canli" "t6u ws-a" "t6u kendi" "t7u default" "t7u eski" "alice ws-a" "none default" "nomem default" "t8u default" "t8u %C3%A7al%C4%B1%C5%9Fma%20alan%C4%B1"; do
  set -- $pair; for l in tr en; do seg=cagrilar; [ $l = en ] && seg=calls; echo "$1 /$l/$2/$seg:$(chain "authjs.session-token=$(ck $1)" "$B/$l/$2/$seg/$ID")"; done; done

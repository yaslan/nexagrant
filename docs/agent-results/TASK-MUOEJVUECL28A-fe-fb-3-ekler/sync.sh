#!/bin/sh
# fb-edge-sync üretim döngüsünün kabuk karşılığı (rev. 4 §4.3-4). $1 = istenen ACTIVE host listesi (boşlukla)
set -u
D=/etc/caddy/agencies.d; F=$D/agencies.caddy; T=$D/agencies.caddy.tmp; SOCK=unix//run/caddy/admin.sock
: > $T
for h in $1; do printf '%s {\n\theader >Strict-Transport-Security "max-age=31536000"\n\treverse_proxy 127.0.0.1:3000\n}\n' "$h" >> $T; done
[ -n "${EXTRA:-}" ] && printf "$EXTRA" >> $T
# (a) YENİ dosyayı denetle: yer tutucu yalnız bu komutun ortamında
if ! FB_AGENCIES=$T caddy adapt --config /etc/caddy/Caddyfile > /tmp/new.json 2>/tmp/adapt.err; then echo "DUR: adapt hatası: $(grep -o 'Error.*' /tmp/adapt.err)"; rm -f $T; exit 1; fi
got=$(jq -r '[.apps.http.servers[].routes[]?.match[]?.host[]?] | unique | sort | join(" ")' /tmp/new.json)
want=$(printf '%s\n' $1 fonbridge.com www.fonbridge.com | sort -u | tr '\n' ' ' | sed 's/ $//')
echo "adapt(tmp) host kümesi: [$got]  beklenen: [$want]"
[ "$got" = "$want" ] || { echo "DUR: küme farkı"; rm -f $T; exit 1; }
jq -e '.admin.listen|startswith("unix/")' /tmp/new.json >/dev/null || { echo "DUR: admin"; exit 1; }
jq -e '[.apps.http.servers[]|select(.listen==[":443"])|.tls_connection_policies? ] | length>=0' /tmp/new.json >/dev/null
jq -e '[.apps.http.servers[].strict_sni_host]|all' /tmp/new.json >/dev/null || { echo "DUR: strict_sni_host"; exit 1; }
jq -e '[.. | objects | select(.handler=="static_response" and .status_code==421)] | length==1' /tmp/new.json >/dev/null || { echo "DUR: 421"; exit 1; }
# (b) atomik yerleştir  (c) yer tutucuSUZ reload
mv -f $T $F
env -u FB_AGENCIES caddy reload --config /etc/caddy/Caddyfile --address $SOCK 2>/tmp/rl.err && echo "reload rc=0" || { echo "reload HATA: $(cat /tmp/rl.err)"; exit 1; }
# (d) ÇALIŞAN yapılandırmanın host kümesi (admin soketinden)
run=$(curl -s --unix-socket /run/caddy/admin.sock http://x/config/ | jq -r '[.apps.http.servers[].routes[]?.match[]?.host[]?] | unique | sort | join(" ")')
echo "çalışan host kümesi:     [$run]"
[ "$run" = "$want" ] && echo "SONUÇ: senkron" || echo "SONUÇ: çalışan≠beklenen"

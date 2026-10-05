#!/bin/bash
# Usage: drive.sh <scenario> <n> <clientIp template {i}=hex(i+1)> <target> [xff template | EMPTY | -] [xff2 template]
# NOCLEAN=1 keeps the rows (a later call reports and deletes them by prefix).
# Each request comes from its own client container on devfb-qd2-net with the chosen address.
scen=$1; n=$2; ipT=$3; target=$4; xffT=${5:--}; xff2=${6:-}
run=$(date +%s)$RANDOM; out=()
for ((i=0; i<n; i++)); do
  hx=$(printf '%x' $((i+1))); ip=${ipT//\{i\}/$hx}
  flag=--ip; [[ $ip == *:* ]] && flag=--ip6
  h=(); [ "$xffT" = EMPTY ] && h=(-H 'X-Forwarded-For;'); [ "$xffT" != - ] && [ "$xffT" != EMPTY ] && h=(-H "X-Forwarded-For: ${xffT//\{i\}/$i}")
  [ -n "$xff2" ] && h+=(-H "X-Forwarded-For: ${xff2//\{i\}/$i}")
  r=$(docker run --rm --network ${NET:-devfb-qd2-net} $flag "$ip" --entrypoint curl nginx:1.30.5 -s -g --max-time 60 "${h[@]}" "$target/lead?email=qd2-$scen-$i-$run@example.test")
  case $r in *rate_limited*) out+=(rl);; *'"ok":true'*) out+=(ok);; *) out+=("other[$r]");; esac
done
echo "$scen: $(IFS=,; echo "${out[*]}")"
[ -z "$NOCLEAN" ] && echo "   $(curl -s "http://127.0.0.1:3962/rows?prefix=qd2-$scen-")"
true

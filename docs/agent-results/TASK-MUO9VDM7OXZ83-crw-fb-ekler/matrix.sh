#!/bin/bash
# usage: matrix.sh port path...   (curl --path-as-is: no client-side normalisation)
P=$1; shift
T=$(mktemp)
printf "%-36s %-4s %-24s %-3s %-5s %-38s %-40s %s\n" PATH CODE CONTENT-TYPE CSP SCR CACHE-CONTROL CSP-HEAD LOCATION
for p in "$@"; do
  h=$(curl -s --path-as-is -o $T -D - "http://127.0.0.1:$P$p")
  code=$(echo "$h" | head -1 | awk '{print $2}')
  ct=$(echo "$h" | grep -i '^content-type:' | head -1 | cut -d' ' -f2- | tr -d '\r' | cut -c1-24)
  csp=$(echo "$h" | grep -ic '^content-security-policy:')
  cc=$(echo "$h" | grep -i '^cache-control:' | cut -d' ' -f2- | tr -d '\r' | cut -c1-38)
  head=$(echo "$h" | grep -i '^content-security-policy:' | cut -d' ' -f2- | tr -d '\r' | cut -c1-40 | paste -sd'|' -)
  loc=$(echo "$h" | grep -i '^location:' | cut -d' ' -f2- | tr -d '\r')
  scr=$(grep -o '<script' $T | wc -l | tr -d ' ')
  printf "%-36s %-4s %-24s %-3s %-5s %-38s %-40s %s\n" "$p" "$code" "$ct" "$csp" "$scr" "$cc" "$head" "$loc"
done
rm -f $T

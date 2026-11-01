#!/bin/bash
# mx.sh port < paths  -> TSV: path code ctype ncsp nscript cache csp-head(40) location
P=$1; T=$(mktemp); H=$(mktemp)
printf "PATH\tCODE\tCTYPE\tCSP\tSCR\tCACHE\tCSPHEAD\tLOC\n"
while IFS= read -r p; do
  curl -s --path-as-is -o $T -D $H "http://127.0.0.1:$P$p"
  code=$(head -1 $H | awk '{print $2}')
  ct=$(grep -i '^content-type:' $H | head -1 | cut -d' ' -f2- | tr -d '\r' | cut -d';' -f1)
  n=$(grep -ic '^content-security-policy:' $H)
  cc=$(grep -i '^cache-control:' $H | cut -d' ' -f2- | tr -d '\r')
  hd=$(grep -i '^content-security-policy:' $H | cut -d' ' -f2- | tr -d '\r' | cut -c1-40 | paste -sd'|' -)
  loc=$(grep -i '^location:' $H | cut -d' ' -f2- | tr -d '\r')
  scr=$(grep -o '<script' $T | wc -l | tr -d ' ')
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$p" "$code" "$ct" "$n" "$scr" "$cc" "$hd" "$loc"
done
rm -f $T $H

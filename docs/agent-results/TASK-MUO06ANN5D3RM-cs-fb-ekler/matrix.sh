#!/bin/bash
# usage: matrix.sh port
P=$1
printf "%-34s %-4s %-26s %-6s %-34s %s\n" PATH CODE CONTENT-TYPE CSP CACHE-CONTROL CSP-HEAD
for p in /logo.png /next.svg /favicon.ico /_next/static/CHUNK "/yok.png" "/x.js" "/yok.PNG" "/robots.txt" "/sitemap.xml" "/.well-known/security.txt" "/fonts/x.woff2" "/a/b/c.css" "/api" "/api/" "/api/yok" "/api/yok.png" "/apifoo" "/api.html" "/api-docs" "/api.png" "/_nextfoo" "/_next/static/yok.js" "/_vercel/x" "/foo.bar" "/wp-login.php" "/tr" "/tr/yok" "/tr/yok.png" "/yok" "/TR/yok.png" "/API/x.png" "/_NEXT/x.js" "/LOGO.PNG" "/a/logo.png" "/_next/yok" "/_next/yok.js" "/_next" "/_next/static/chunks/yok.js" "/_next/image" "/_vercel/x.js" "/_NEXT/static/x.js"; do
  q=$p
  if [ "$p" = /_next/static/CHUNK ]; then q=/_next/static/chunks/$(ls wt06/.next/static/chunks | grep '\.js$' | head -1); fi
  h=$(curl -s -o $(dirname $0)/body.tmp -D - "http://127.0.0.1:$P$q")
  code=$(echo "$h" | head -1 | awk '{print $2}')
  ct=$(echo "$h" | grep -i '^content-type:' | head -1 | cut -d' ' -f2- | tr -d '\r' | cut -c1-24)
  csp=$(echo "$h" | grep -ic '^content-security-policy:')
  cc=$(echo "$h" | grep -i '^cache-control:' | cut -d' ' -f2- | tr -d '\r' | cut -c1-34)
  head=$(echo "$h" | grep -i '^content-security-policy:' | cut -d' ' -f2- | cut -c1-40 | tr -d '\r')
  scripts=$(grep -o '<script' $(dirname $0)/body.tmp | wc -l | tr -d ' ')
  printf "%-34s %-4s %-26s %-6s %-34s %s [scr=%s]\n" "$p" "$code" "$ct" "$csp" "$cc" "$head" "$scripts"
done
rm -f $(dirname $0)/body.tmp

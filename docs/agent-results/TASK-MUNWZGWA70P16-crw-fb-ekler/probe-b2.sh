#!/bin/bash
B=http://127.0.0.1:47181
for L in tr en; do for pg in calls calls/germany; do
  html=$(curl -s $B/$L/$pg)
  hrefs=(); while IFS= read -r h; do [ -n "$h" ] && hrefs+=("$h"); done < <(printf '%s' "$html" | grep -oE 'href="[^"]*(callbackUrl|/default/)[^"]*"' | sed 's/href="//;s/"$//;s/&amp;/\&/g' | sort -u)
  old=$(printf '%s' "$html" | grep -cE "href=\"/$L/calls/[A-Z]")
  codes=$(for h in "${hrefs[@]}"; do curl -s -o /dev/null -w '%{http_code}\n' "$B$h"; done | sort | uniq -c | tr -s ' \n' ' ')
  echo "$L/$pg distinct-links=${#hrefs[@]} old-style=/$L/calls/<ID>:$old signed-out-codes:$codes"
done; done
echo "sitemap.xml $(curl -s -o /dev/null -w '%{http_code}' $B/sitemap.xml) · robots.txt $(curl -s -o /dev/null -w '%{http_code}' $B/robots.txt)"
echo "detail signed-out: /tr/default/cagrilar/EUROSTARS-2026-01-01 -> $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' $B/tr/default/cagrilar/EUROSTARS-2026-01-01)"

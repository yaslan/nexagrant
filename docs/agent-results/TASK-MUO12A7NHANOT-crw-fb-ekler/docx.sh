#!/bin/bash
S=$(dirname "$0"); B=http://localhost:3512
C="authjs.session-token=$(python3 -c "import json;print(json.load(open('$S/cookies.json'))['owner'])")"
for k in nolabel numlabel null ok; do
  f=$S/ev/cn-$k.docx
  ex=$(curl -s -b "$C" -o $f -w "%{http_code} %{content_type}" $B/api/concept-notes/o12a-cn-$k/export)
  ed=$(curl -s -b "$C" -o /dev/null -w "%{http_code}" $B/tr/ws-a/konsept-notlar/o12a-cn-$k)
  kind=$(file -b $f | cut -c1-30)
  heads=$(unzip -p $f word/document.xml 2>/dev/null | python3 -c "import sys,re;x=sys.stdin.read();print('|'.join(t for t in re.findall(r'<w:t[^>]*>([^<]*)</w:t>',x) if t.strip())[:160])")
  echo "cn-$k editor=$ed export=$ex file=[$kind] metin=[$heads]"
done

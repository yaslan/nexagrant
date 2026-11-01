#!/bin/bash
S=$(dirname "$0"); B=http://localhost:3583
C="authjs.session-token=$(python3 -c "import json;print(json.load(open('$S/cookies.json'))['owner'])")"
L0=$(grep -c TypeError $S/server.log)
for k in nolabel numlabel objlabel arrlabel nulllabel boollabel emptylabel htmllabel protokey dupkey numkey schemastr schemanum sectionsstr sectionsobj contentnull contentarr contentstr contentnum contentobj maxwordsstr ok; do
  f=$S/docx/cn-$k.docx; rm -f $f
  ex=$(curl -s -b "$C" -o $f -w "%{http_code}" $B/api/concept-notes/o83-cn-$k/export)
  ed=$(curl -s -b "$C" -o /dev/null -w "%{http_code}" $B/tr/ws-b/konsept-notlar/o83-cn-$k)
  kind=$(file -b $f | cut -c1-12)
  heads=$(unzip -p $f word/document.xml 2>/dev/null | python3 -c "import sys,re;x=sys.stdin.read();print('|'.join(t for t in re.findall(r'<w:t[^>]*>([^<]*)</w:t>',x) if t.strip())[:140])")
  echo "cn-$k editor=$ed export=$ex [$kind] metin=[$heads]"
done
echo "m2 sayfası (şablon seçimi, ConceptNoteEditor): $(curl -s -b "$C" -o /dev/null -w "%{http_code}" "$B/tr/ws-b/opportunities/cmuo3qhyn0001rnxklrbgi33y/m2")"
echo "yeni TypeError satırı: $(( $(grep -c TypeError $S/server.log) - L0 ))"; grep -A2 "TypeError" $S/server.log | tail -8

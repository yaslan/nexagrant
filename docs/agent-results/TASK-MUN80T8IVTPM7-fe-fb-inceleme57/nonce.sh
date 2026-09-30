B=http://127.0.0.1:47957
for p in /tr /en /tr/login /tr/fon-hazirlik /tr/blog /tr/yok-boyle-sayfa "$@"; do
 for i in 1 2; do
  curl -s -D /tmp/h.$$ -o /tmp/b.$$ ${CK:+-b "$CK"} "$B$p"
  hn=$(grep -i '^content-security-policy:' /tmp/h.$$ | grep -o "nonce-[^']*" | sed 's/nonce-//')
  tags=$(grep -o '<script[^>]*>' /tmp/b.$$ | wc -l | tr -d ' ')
  with=$(grep -o '<script[^>]*nonce="[^"]*"' /tmp/b.$$ | wc -l | tr -d ' ')
  uniq=$(grep -o 'nonce="[^"]*"' /tmp/b.$$ | sort -u | tr '\n' ' ')
  echo "$p #$i hdr=$hn scripts=$tags withNonce=$with htmlNonces=$uniq"
 done
done
rm -f /tmp/h.$$ /tmp/b.$$

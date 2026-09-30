#!/bin/bash
# Geri dönüş sayımı: checklist'teki iki komut birebir (down'dan önce User anlık görüntüsü; gün sonunda comm -12).
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
S=postgresql://fabrika:fixpw@127.0.0.1:55106/q
export DATABASE_URL=postgresql://own:ownpw@127.0.0.1:55106/q
psql -Atq "$DATABASE_URL" -c "SELECT id FROM \"User\" WHERE \"staleDigestOn\" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1" > m4-user-today.txt
echo "m4-user-today: [$(paste -sd, m4-user-today.txt)]"
psql -q "$DATABASE_URL" -f ../wt/prisma/migrations/m4-stale-digest-user-claim.down.sql && echo "down.sql sahip rolle: ok"
# eski sürüm geri döndü, uN'ye ikinci özeti gönderdi (Membership claim bugüne)
psql -q $S -c "UPDATE \"Membership\" SET \"staleDigestOn\"=NULL WHERE id='mN'; UPDATE \"Membership\" SET \"staleDigestOn\"=(now() AT TIME ZONE 'UTC')::date WHERE id='mO'"
echo "iki özet sayısı: $(psql -Atq "$DATABASE_URL" -f m4-claims.sql | comm -12 m4-user-today.txt - | wc -l | tr -d ' ')  (beklenen 1: uO)"
psql -Atq "$DATABASE_URL" -f m4-double.sql 2>&1 | head -2

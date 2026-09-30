#!/bin/bash
# sim.sh — tespit sorgularını R0/R1/R2 son durumları üzerinde dener (durumlar İNCELEME-102 -ekler/R*.txt'den).
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SP=$(cd "$(dirname "$0")" && pwd)
S=postgresql://fabrika:fixpw@127.0.0.1:55119/q2   # süper kullanıcı: yalnız tohum
O=postgresql://own:ownpw@127.0.0.1:55119/q2       # sahip rol (süper değil, BYPASSRLS değil): operatör sorguları
echo "operatör URL=$(echo $O | sed -E 's#:[^:@/]+@#:***@#')"
psql $O -Atc "select 'own super='||rolsuper||' bypassrls='||rolbypassrls from pg_roles where rolname=current_user"
seed() {
psql -q $S <<'SQL'
DELETE FROM "Membership" WHERE "userId" IN ('uA','uC','uE'); DELETE FROM "User" WHERE id IN ('uA','uC','uE'); DELETE FROM "Tenant" WHERE id IN ('tA','tB');
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('tA','A','ta','TR',now()),('tB','B','tb','TR',now());
INSERT INTO "User"(id,email,"updatedAt") VALUES ('uA','uA@x.test',now()),('uC','uC@x.test',now()),('uE','uE@x.test',now());
INSERT INTO "Membership"(id,"tenantId","userId") VALUES ('m1','tA','uA'),('m2','tB','uA'),('m3','tB','uC'),('m4','tA','uE');
SQL
}
M="UPDATE \"Membership\" SET \"staleDigestOn\"=(now() AT TIME ZONE 'UTC')::date WHERE id IN"
U="UPDATE \"User\" SET \"staleDigestOn\"=(now() AT TIME ZONE 'UTC')::date WHERE id IN"
BF="$(sed -n '/^DO \$\$/,/^\$\$;/p' $SP/../wt/prisma/migrations/m4-stale-digest-user-claim.sql)"
run() { # run <ad> <eski-migrate-öncesi SQL> <migrate-sonrası SQL>
  echo "=== $1"; seed
  [ -n "$2" ] && psql -q $S -c "$2"
  psql -Atq $O -f $SP/claims.sql > $SP/before-$1.txt          # 2a'dan sonra, 3. adımdan önce
  echo "N0=$(wc -l < $SP/before-$1.txt | tr -d ' ')  düz sorgu (enter_system_scope YOK)=$(psql -Atq $O -c "SELECT count(*) FROM \"Membership\" WHERE \"staleDigestOn\" >= (now() AT TIME ZONE 'UTC')::date")"
  psql -q $O -c "$BF"                                           # 3. adım: gerçek backfill bloğu, sahip rolüyle
  [ -n "$3" ] && psql -q $S -c "$3"
  psql -Atq $O -f $SP/claims.sql > $SP/after-$1.txt
  echo "N1=$(wc -l < $SP/after-$1.txt | tr -d ' ')  yeni Membership claim'i: [$(comm -13 $SP/before-$1.txt $SP/after-$1.txt | paste -sd, -)]"
  echo "iki özet adayı: [$(psql -Atq $O -f $SP/double.sql | comm -23 - $SP/before-$1.txt | paste -sd, -)]"
}
# R2 (2a uygulandı): eski 07:00 migrate'ten ÖNCE → m2 (tB/uA), m3 (tB/uC), m4 (tA/uE); yeni worker hepsini atlar.
run R2 "$M ('m2','m3','m4')" ""
# R0 (eski migrate'ten SONRA, yeni daha sonra): eski m2,m3,m4 yazar; yeni legacyClaims ile atlar, User'a yazmaz.
run R0 "" "$M ('m2','m3','m4')"
# R1 (ters yön, Y-1): yeni 07:00 → User uA,uE; eski 07:22 → Membership m2 (tB/uA), m3 (tB/uC). Ölçülen: uA 2 özet.
run R1 "" "$U ('uA','uE'); $M ('m2','m3')"

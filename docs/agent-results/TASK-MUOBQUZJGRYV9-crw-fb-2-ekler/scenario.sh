#!/bin/bash
# TASK-MUOBQUZJGRYV9 (İNCELEME-106 Y-1): real old (f7a6dcf5^) and new M4 code,
# a recording mailer, the operator SQL extracted verbatim from
# docs/RELEASE_CHECKLIST.md, and the migration chain re-run after the digests.
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SP=/private/tmp/claude-501/-Users-macbook-alan/543a4cb5-d673-4ef6-a2d8-4140ef0ee75c/scratchpad
S=postgresql://fabrika:fixpw@127.0.0.1:55107/f     # superuser: seed + chain (I-1: owner cannot SET app.system_scope)
O=postgresql://own:ownpw@127.0.0.1:55107/f         # owner, not super/BYPASSRLS: operator queries
APP=$(grep '^DATABASE_URL_RLS_TEST=' $SP/wt/.env | cut -d= -f2-)   # fabrika_app: the workers
echo "operator DATABASE_URL=$O"; echo "worker   DATABASE_URL=${APP%%:*}://fabrika_app:***@${APP##*@}"
psql -Atc "select 'own super='||rolsuper||' bypassrls='||rolbypassrls from pg_roles where rolname='own'" $O
claims() { psql -Atq "$O" -f $SP/ev/m4-claims.sql; }
double() { psql -Atq "$O" -f $SP/ev/m4-double.sql | LC_ALL=C comm -23 - "$1" | wc -l | tr -d ' '; }
seed() { # $1 tenant, $2 user
  psql -q $S <<SQL
DELETE FROM "Relationship" WHERE "tenantId"='$1'; DELETE FROM "ModuleState" WHERE "tenantId"='$1';
DELETE FROM "Subscription" WHERE "tenantId"='$1'; DELETE FROM "Membership" WHERE "tenantId"='$1';
DELETE FROM "Tenant" WHERE id='$1'; DELETE FROM "User" WHERE id='$2';
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('$1','$1','$1','TR',now());
INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES ('$1','pro','ACTIVE',now());
INSERT INTO "ModuleState"(id,"tenantId","moduleId",status) VALUES ('ms-$1','$1','M4','ON');
INSERT INTO "User"(id,email,"updatedAt") VALUES ('$2','$2@example.test',now());
INSERT INTO "Membership"(id,"tenantId","userId") VALUES ('m-$2','$1','$2');
INSERT INTO "Relationship"(id,"tenantId",kind,"counterpartName","updatedAt","ownerUserId","lastContactAt")
  VALUES ('r-$2','$1','partner','r-$2',now(),'$2',now()-interval '70 days');
SQL
}
new()  { (cd $SP/wt    && DATABASE_URL=$APP node_modules/.bin/tsx .muobqu-runner.ts "$1" 2>&1 | tail -1); }
old()  { (cd $SP/wtold && DATABASE_URL=$APP node_modules/.bin/tsx .muobqu-runner.ts "$1" 2>&1 | tail -1); }
chain() { (cd $SP/wt && DATABASE_URL=$S scripts/apply-migrations.sh 2>&1 | tail -1); }
state() { psql -Atc "select 'Membership='||coalesce(m.\"staleDigestOn\"::text,'NULL')||' User='||coalesce(u.\"staleDigestOn\"::text,'NULL') from \"Membership\" m join \"User\" u on u.id=m.\"userId\" where m.\"userId\"='$1'" $S; }
report() { # $1 label $2 before-file
  claims > $SP/ev/after.txt
  echo "  tespit  LC_ALL=C comm -13 before after: [$(LC_ALL=C comm -13 $2 $SP/ev/after.txt | grep -E "$USERS" | paste -sd, -)]"
  echo "  sayım   m4-double | comm -23 | wc -l  : $(psql -Atq "$O" -f $SP/ev/m4-double.sql | grep -E "$USERS" | LC_ALL=C comm -23 - $2 | wc -l | tr -d ' ')"
}
USERS='^u-(a|b|c)$'
wipe() { psql -q $S -c "DELETE FROM \"Relationship\" WHERE \"tenantId\" IN ('t-a','t-b','t-c'); DELETE FROM \"Tenant\" WHERE id IN ('t-a','t-b','t-c'); DELETE FROM \"User\" WHERE id IN ('u-a','u-b','u-c')"; }
wipe
echo "UTC today: $(psql -Atc "select (now() at time zone 'UTC')::date" $S)"

echo; echo "=== (a) 2a UYGULANDI: yalnız yeni worker, sonra zincir yeniden koşuldu (Y-1 senaryosu) ==="
seed t-a u-a; claims > $SP/ev/before-a.txt; echo "  before (bu kullanıcılar): [$(grep -E "$USERS" $SP/ev/before-a.txt | paste -sd, -)]"
echo "  new worker: $(new t-a)"; echo "  $(state u-a)"
echo "  -- zincir yeniden koşmadan önce:"; report a $SP/ev/before-a.txt
echo "  chain rerun (DÜZELTİLMİŞ backfill): $(chain)"; echo "  $(state u-a)"
echo "  -- zincir yeniden koştuktan sonra:"; report a $SP/ev/before-a.txt

echo; echo "=== (b) 2a ATLANDI: önce YENİ sonra ESKİ worker (tablo 3. satır), sonra zincir yeniden koşuldu ==="
seed t-b u-b; claims > $SP/ev/before-b.txt
echo "  new worker: $(new t-b)"
# the old worker's second job needs something due: a contact that went stale after the new run
psql -q $S -c "INSERT INTO \"Relationship\"(id,\"tenantId\",kind,\"counterpartName\",\"updatedAt\",\"ownerUserId\",\"lastContactAt\") VALUES ('r2-u-b','t-b','partner','r2-u-b',now(),'u-b',now()-interval '61 days')"
echo "  old worker: $(old t-b)"; echo "  $(state u-b)"
echo "  -- zincir yeniden koşmadan önce:"; report b $SP/ev/before-b.txt
echo "  chain rerun: $(chain)"; echo "  $(state u-b)"
echo "  -- zincir yeniden koştuktan sonra:"; report b $SP/ev/before-b.txt

echo; echo "=== (c) 2a ATLANDI: önce ESKİ sonra YENİ worker (tablo 2. satır), sonra zincir yeniden koşuldu ==="
seed t-c u-c; claims > $SP/ev/before-c.txt
echo "  old worker: $(old t-c)"; echo "  new worker: $(new t-c)"; echo "  $(state u-c)"
echo "  -- zincir yeniden koşmadan önce:"; report c $SP/ev/before-c.txt
echo "  chain rerun: $(chain)"; echo "  $(state u-c)"
echo "  -- zincir yeniden koştuktan sonra:"; report c $SP/ev/before-c.txt

echo; echo "=== (d) KONTROL: (a)'nın kullanıcısı, dev'deki (düzeltme ÖNCESİ) m4-stale-reminder-idempotency.sql ile ==="
psql -q -v ON_ERROR_STOP=1 $S -f $SP/ev/idem-dev.sql 2>/dev/null && echo "  dev dosyası koşuldu; $(state u-a)"
claims > $SP/ev/after.txt
echo "  tespit (yalnız u-a): [$(LC_ALL=C comm -13 $SP/ev/before-a.txt $SP/ev/after.txt | grep -x u-a | paste -sd, -)]   <- Y-1 yanlış alarmı, eski worker yok"
wipe

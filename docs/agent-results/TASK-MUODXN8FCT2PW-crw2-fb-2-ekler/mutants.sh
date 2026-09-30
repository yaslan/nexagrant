#!/bin/bash
# crw2-fb TASK-MUODXN8FCT2PW — mutantlar: dosyayı değiştir → zincir + tespit + live test → geri al → git diff boş
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SP=/private/tmp/claude-501/-Users-macbook-alan/6b4bf0a8-11ea-4f02-841f-49270074e445/scratchpad
cd $SP/wt
S=postgresql://fabrika:crw2pw@127.0.0.1:55110/f; O=postgresql://own:ownpw110@127.0.0.1:55110/f
APP=$(grep '^DATABASE_URL_RLS_TEST=' .env | cut -d= -f2-)
F=prisma/migrations/m4-stale-reminder-idempotency.sql; T=tests/stale-relationship-reminder.live.test.ts
mask() { printf '%s' "$1" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'; }
q() { psql -X -Atq "$S" "$@"; }
export DATABASE_URL=$S
echo "DATABASE_URL=$(mask $DATABASE_URL) (zincir+live test sahibi) · ops=$(mask $O) · worker=$(mask $APP)"
fresh() { q <<SQL
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('c2-t$1','c2-t$1','c2-t$1','TR',now());
INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES ('c2-t$1','pro','ACTIVE',now());
INSERT INTO "ModuleState"(id,"tenantId","moduleId",status) VALUES ('ms-c2-t$1','c2-t$1','M4','ON');
INSERT INTO "User"(id,email,"updatedAt") VALUES ('c2-u$1','c2-u$1@example.test',now());
INSERT INTO "Membership"(id,"tenantId","userId") VALUES ('m-c2-u$1','c2-t$1','c2-u$1');
INSERT INTO "Relationship"(id,"tenantId",kind,"counterpartName","updatedAt","ownerUserId","lastContactAt")
  VALUES ('c2-r$1','c2-t$1','partner','c2-r$1',now(),'c2-u$1',now()-interval '70 days');
SQL
}
state() { q -c "select '    c2-u$1: User='||coalesce(u.\"staleDigestOn\"::text,'NULL')||' Membership='||coalesce(m.\"staleDigestOn\"::text,'NULL') from \"User\" u join \"Membership\" m on m.\"userId\"=u.id where u.id='c2-u$1'"; }
run_mutant() { # name
  local m=$1; echo; echo "=================== $m ==================="
  echo "\$ git diff -- $F"; git diff -- $F | sed 's/^/    /'
  fresh $m; rm -rf $SP/ev/ops-$m; mkdir -p $SP/ev/ops-$m
  (cd $SP/ev/ops-$m && DATABASE_URL=$O bash $SP/ev/ops/block1.sh >/dev/null)
  echo "  yeni worker: $(DATABASE_URL=$APP node_modules/.bin/tsx .crw2-runner.ts - c2-t$m 2>&1 | tail -1)"; state $m
  out=$(scripts/apply-migrations.sh 2>&1); rc=$?
  echo "  zincir (mutant, DATABASE_URL=$(mask $S)): exit=$rc"; printf '%s\n' "$out" | grep -E 'ERROR|LINE|HINT|\^|files applied' | sed 's/^/    /'
  [ $rc -ne 0 ] && printf '%s\n' "$out" | grep '^==>' | tail -1 | sed 's/^/    durdu: /'
  state $m
  echo "  tespit (belge bloğu 2, sahip rol):"; (cd $SP/ev/ops-$m && DATABASE_URL=$O bash $SP/ev/ops/block2.sh 2>&1 | grep -x "c2-u$m\|.*ERROR.*" | sed 's/^/    | /')
  echo "  \$ CI=1 vitest run $T"
  CI=1 AUTH_SECRET=x pnpm exec vitest run $T > $SP/ev/live-$m.log 2>&1; rc=$?
  grep -E '×|Test Files|Tests  |AssertionError|error: |operator does not exist' $SP/ev/live-$m.log | head -8 | sed 's/^/    /'; echo "    vitest exit=$rc"
  git checkout -- $F; echo "  geri alındı: \$ git diff --stat -- $F → [$(git diff --stat -- $F)]  git status --short → [$(git status --short -- $F)]"
}
# M1 >= → >
sed -i '' "s/'staleDigestOn')::date >= s.day/'staleDigestOn')::date > s.day/" $F; run_mutant M1
# M2 NOT EXISTS kaldır
python3 - $F <<'P'
import sys,re; p=sys.argv[1]; s=open(p).read()
s2=re.sub(r'\n   AND NOT EXISTS \(\n.*?\n   \);', ';', s, flags=re.S); assert s2!=s; open(p,'w').write(s2)
P
run_mutant M2
# M3 ::date kaldır
sed -i '' "s/(to_jsonb(u) ->> 'staleDigestOn')::date >= s.day/(to_jsonb(u) ->> 'staleDigestOn') >= s.day/" $F; run_mutant M3
# M4 (ek): to_jsonb yerine doğrudan kolon — push'suz zincirde kırılır
sed -i '' "s/(to_jsonb(u) ->> 'staleDigestOn')::date >= s.day/u.\"staleDigestOn\" >= s.day/" $F; run_mutant M4
echo "  -- M4 push'suz ölçüm: User.staleDigestOn olmayan DB'de 38. dosya tek başına"
sed -i '' "s/(to_jsonb(u) ->> 'staleDigestOn')::date >= s.day/u.\"staleDigestOn\" >= s.day/" $F
NP2=postgresql://fabrika:crw2pw@127.0.0.1:55110/np2; q -c "create database np2"
DATABASE_URL=$NP2 pnpm exec prisma db push 2>&1 | grep -c 'in sync' | sed 's/^/    push in-sync satırı: /'
psql -X -q $NP2 -c 'ALTER TABLE "User" DROP COLUMN "staleDigestOn"'
psql -X -q -v ON_ERROR_STOP=1 $NP2 -f $F 2>&1 | grep -v NOTICE | sed 's/^/    /'; echo "    exit=${PIPESTATUS[0]}"
git checkout -- $F; echo "    düzeltilmiş dosya aynı DB'de:"; psql -X -q -v ON_ERROR_STOP=1 $NP2 -f $F 2>&1 | grep -v NOTICE | sed 's/^/    /'; echo "    exit=${PIPESTATUS[0]}"
q -c "drop database np2"
echo; echo "=== son durum ==="; echo "\$ git status --short (worktree, izlenen dosyalar)"; git status --short --untracked-files=no | sed 's/^/    /'; echo "    [bitti]"
echo "\$ zincir temiz dosyayla: $(scripts/apply-migrations.sh 2>&1 | tail -1) exit=$?"

#!/bin/bash
# Y-1: yeni sürüm yayından sonra özet gönderdi (User claim + Relationship.staleRemindedAt=bugün),
# sonra apply-migrations.sh yeniden koşuldu (ikinci yayın / aynı gün yeniden deneme).
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
S=postgresql://fabrika:fixpw@127.0.0.1:55106/q   # süper: yalnız tohum + zincir (izole kurulumda sahip rol app.system_scope SET edemedi)
O=postgresql://own:ownpw@127.0.0.1:55106/q       # sahip rol, süper değil: operatör sorguları
export DATABASE_URL=$O
psql -Atc "select 'own super='||rolsuper||' bypassrls='||rolbypassrls from pg_roles where rolname='own'" $O
psql -q $S <<'SQL'
DELETE FROM "Relationship" WHERE id IN ('rN','rO'); DELETE FROM "Membership" WHERE id IN ('mN','mO');
DELETE FROM "User" WHERE id IN ('uN','uO'); DELETE FROM "Tenant" WHERE id='tA';
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('tA','A','ta','TR',now());
-- uN: yayından sonra ilk kez yeni sürümden özet aldı (Membership claim'i hiç yok)
-- uO: eski sürümden dün özet almıştı (Membership.staleDigestOn = dün), bugün yeni sürümden aldı
INSERT INTO "User"(id,email,"updatedAt","staleDigestOn") VALUES
 ('uN','uN@x.test',now(),(now() AT TIME ZONE 'UTC')::date),
 ('uO','uO@x.test',now(),(now() AT TIME ZONE 'UTC')::date);
INSERT INTO "Membership"(id,"tenantId","userId","staleDigestOn") VALUES
 ('mN','tA','uN',NULL), ('mO','tA','uO',(now() AT TIME ZONE 'UTC')::date - 1);
-- stampRows: staleRemindedAt = now, staleRemindedContactAt = lastContactAt
INSERT INTO "Relationship"(id,"tenantId",kind,"updatedAt","ownerUserId","lastContactAt","staleRemindedAt","staleRemindedContactAt") VALUES
 ('rN','tA','partner',now(),'uN',now()-interval '70 days',now(),now()-interval '70 days'),
 ('rO','tA','partner',now(),'uO',now()-interval '70 days',now(),now()-interval '70 days');
SQL
psql -Atq "$DATABASE_URL" -f m4-claims.sql > before.txt
echo "before (m4-claims.sql): [$(paste -sd, before.txt)]"
( cd ../wt && DATABASE_URL=$S scripts/apply-migrations.sh >/dev/null 2>&1; echo "apply-migrations exit=$?" )
psql -Atq "$DATABASE_URL" -f m4-claims.sql > after.txt
echo "after  (m4-claims.sql): [$(paste -sd, after.txt)]"
echo "comm -13 (checklist 'boş olmalı'): [$(comm -13 before.txt after.txt | paste -sd, -)]"
echo "m4-double.sql | comm -23 - before | wc -l = $(psql -Atq "$DATABASE_URL" -f m4-double.sql | comm -23 - before.txt | wc -l | tr -d ' ')"
psql -Atc "select id, \"staleDigestOn\" from \"Membership\" where id in ('mN','mO') order by 1" $S

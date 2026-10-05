#!/bin/bash
M=$1/wt77/prisma/migrations
P() { docker exec -i crwfb77-pg psql -U fabrika fabrika -X "$@"; }
echo '== state before'; P -tAc 'select count(*) filter (where "r2ObjectKey" is not null), count(*) from "Evidence"'
echo '== down #1'; P -q -f - < $M/evidence-unique-object-key.down.sql; echo "rc=$?"
echo '== down #2'; P -q -f - < $M/evidence-unique-object-key.down.sql; echo "rc=$?"
T1=$(P -tAc 'select id from "Tenant" order by "createdAt" limit 1'); T2=$(P -tAc 'select id from "Tenant" order by "createdAt" offset 1 limit 1')
echo "== duplicates: tenant1 same key x2 (dup-key-1), tenant1+tenant2 same key (cross), tenant1 NULL key x2"
P -q <<SQL
insert into "Evidence"(id,"tenantId",title,kind,category,body,"r2ObjectKey","updatedAt") values
 ('crw77dup1','$T1','d1','certificate','CAT-03','','$T1/org-default/x/2026/dup.pdf',now()),
 ('crw77dup2','$T1','d2','certificate','CAT-03','','$T1/org-default/x/2026/dup.pdf',now()),
 ('crw77crs1','$T1','c1','certificate','CAT-03','','shared/cross.pdf',now()),
 ('crw77crs2','$T2','c2','certificate','CAT-03','','shared/cross.pdf',now()),
 ('crw77nul1','$T1','n1','certificate','CAT-03','',NULL,now()),
 ('crw77nul2','$T1','n2','certificate','CAT-03','',NULL,now());
SQL
echo "insert rc=$?"
echo '== up with duplicates'; P -q -v ON_ERROR_STOP=1 -f - < $M/evidence-unique-object-key.sql; echo "rc=$?"
P -tAc "select count(*) from pg_indexes where indexname='Evidence_tenantId_r2ObjectKey_key'" | sed 's/^/index present: /'
echo '== resolve as the header says (NULL the loser key)'; P -q -c "update \"Evidence\" set \"r2ObjectKey\"=null where id='crw77dup2'"
echo '== up #1'; P -q -v ON_ERROR_STOP=1 -f - < $M/evidence-unique-object-key.sql; echo "rc=$?"
echo '== up #2'; P -q -v ON_ERROR_STOP=1 -f - < $M/evidence-unique-object-key.sql; echo "rc=$?"
echo '== after: dup insert blocked? cross-tenant/NULL allowed?'
P -q -c "insert into \"Evidence\"(id,\"tenantId\",title,kind,category,body,\"r2ObjectKey\",\"updatedAt\") values ('crw77dup3','$T1','d3','certificate','CAT-03','','$T1/org-default/x/2026/dup.pdf',now())" 2>&1 | head -2
P -tAc "select count(*) from \"Evidence\" where id like 'crw77%'" | sed 's/^/rows kept: /'
P -q -c "delete from \"Evidence\" where id like 'crw77%'"

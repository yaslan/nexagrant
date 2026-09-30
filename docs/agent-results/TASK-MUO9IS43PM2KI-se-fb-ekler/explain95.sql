\pset pager off
ANALYZE "Membership"; ANALYZE "User";
\echo '== owner: GDPR export / request-deletion (userId =)'
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON) SELECT id,"tenantId",role FROM "Membership" WHERE "userId"='bulk95-u12345';
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON) SELECT id,"tenantId",role FROM "Membership" WHERE "userId"='bulk95-u12345';
\echo '== owner: auth.ts jwt memberships (userId IN + tenant join)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT m.id FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId" WHERE m."userId" IN ('bulk95-u12345') AND t."deletedAt" IS NULL;
\echo '== owner: yeni claim (User PK, FOR UPDATE) — geri alınır'
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF) UPDATE "User" u SET "staleDigestOn" = '2026-10-09'::date FROM (SELECT id, "staleDigestOn" AS prev FROM "User" WHERE id = 'bulk95-u12345' FOR UPDATE) o WHERE u.id = o.id AND (o.prev IS NULL OR o.prev < '2026-10-09'::date) RETURNING o.prev::text;
ROLLBACK;
\echo '== owner: claimedToday (id IN sayfa + gün)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT id FROM "User" WHERE id IN (SELECT 'bulk95-u'||g FROM generate_series(1,500) g) AND "staleDigestOn" >= '2026-10-05';
\echo '== owner: DELETE User (FK cascade) — geri alınır'
BEGIN; EXPLAIN (ANALYZE, COSTS OFF) DELETE FROM "User" WHERE id='bulk95-u777'; ROLLBACK;

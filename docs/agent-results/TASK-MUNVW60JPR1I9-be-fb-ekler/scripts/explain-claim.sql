\pset pager off
\echo '== yeni claim (User PK, tek ifade), fabrika_app, geri alınır'
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF) UPDATE "User" u SET "staleDigestOn" = '2026-10-09'::date
  FROM (SELECT id, "staleDigestOn" AS prev FROM "User" WHERE id = 'u96-s0-fx' FOR UPDATE) o
 WHERE u.id = o.id AND (o.prev IS NULL OR o.prev < '2026-10-09'::date)
RETURNING o.prev::text AS previous;
ROLLBACK;

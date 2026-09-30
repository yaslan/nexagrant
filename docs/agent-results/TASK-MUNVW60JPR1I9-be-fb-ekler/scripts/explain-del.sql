\pset pager off
\echo '== Q3 kullanici silme (Membership FK cascade), geri alinir'
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF) DELETE FROM "User" WHERE id = 'bulk-u-30002';
ROLLBACK;
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF) DELETE FROM "User" WHERE id = 'bulk-u-30003';
ROLLBACK;

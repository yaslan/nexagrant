\pset pager off
BEGIN;
SELECT enter_system_scope('subject-scoped');
\echo '== fabrika_app + system scope: GDPR export (userId =)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT id,"tenantId",role FROM "Membership" WHERE "userId"='bulk95-u12345';
EXPLAIN (ANALYZE, COSTS OFF) SELECT id,"tenantId",role FROM "Membership" WHERE "userId"='bulk95-u12345';
ROLLBACK;

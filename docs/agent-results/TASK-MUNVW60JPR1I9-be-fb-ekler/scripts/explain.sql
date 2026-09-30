\pset pager off
BEGIN;
SELECT enter_system_scope('cross-tenant-job');
SELECT count(*) AS memberships_visible FROM "Membership";
\echo '== Q1 claimedElsewhere (onceki claim sorgusu)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "tenantId" FROM "Membership" WHERE "userId" = 'bulk-u-30001' AND "tenantId" NOT IN ('bulk-t-1') AND "staleDigestOn" >= DATE '2026-09-30' LIMIT 1;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "tenantId" FROM "Membership" WHERE "userId" = 'bulk-u-30001' AND "tenantId" NOT IN ('bulk-t-1') AND "staleDigestOn" >= DATE '2026-09-30' LIMIT 1;
\echo '== Q2 kullanicinin uyelikleri (GDPR export / hesap silme)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "tenantId" FROM "Membership" WHERE "userId" = 'bulk-u-30001';
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "tenantId" FROM "Membership" WHERE "userId" = 'bulk-u-30001';
ROLLBACK;

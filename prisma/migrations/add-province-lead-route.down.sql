-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-province-lead-route.sql. Refuses while the routing map or the routing
-- outcome on a lead holds data: dropping them would erase which consultancy was promised
-- which province and which leads are waiting unmatched. Export and clear them first.
DO $$
BEGIN
  IF to_regclass('public."ProvinceLeadRoute"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "ProvinceLeadRoute") THEN
    RAISE EXCEPTION 'ProvinceLeadRoute has rows; export and delete them first';
  END IF;
  IF EXISTS (SELECT 1 FROM "PublicLead" WHERE "routeStatus" IS NOT NULL) THEN
    RAISE EXCEPTION 'PublicLead rows carry a routing outcome; export and clear them first';
  END IF;
END $$;
DROP TABLE IF EXISTS "ProvinceLeadRoute";
DROP INDEX IF EXISTS "PublicLead_routeStatus_createdAt_idx";
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_routeStatus_check";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "routedAt";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "routedTenantId";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "routeReason";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "routeStatus";

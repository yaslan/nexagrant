-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-public-lead-route-consistency.sql: drops the consistency CHECK only.
-- No data is changed or lost; the routing columns and the older routeStatus check stay.
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_route_consistency_check";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-org-readiness-tables.down.sql — rollback for add-org-readiness-tables.sql (NG-34)
--
-- DESTRUCTIVE: drops OrgReadiness, InternalApproval and PartnerBudgetShare with their rows,
-- and the two unique indexes the composite FKs used. No other table loses a row. Revert
-- prisma/schema.prisma, prisma/rls.sql and apply-order.txt in the same step. Export first if
-- it matters:
--   \copy (SELECT * FROM "InternalApproval") TO 'internal-approval-backup.csv' CSV HEADER
--   \copy (SELECT * FROM "PartnerBudgetShare") TO 'partner-budget-share-backup.csv' CSV HEADER
--   \copy (SELECT * FROM "OrgReadiness") TO 'org-readiness-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "PartnerBudgetShare";
DROP TABLE IF EXISTS "InternalApproval";
DROP TABLE IF EXISTS "OrgReadiness";

DROP INDEX IF EXISTS "ConsortiumSeat_id_tenantId_key";
DROP INDEX IF EXISTS "Opportunity_id_tenantId_key";

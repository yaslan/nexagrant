-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-m18-client-pipeline.down.sql — rollback for add-m18-client-pipeline.sql (NG-143)
--
-- DESTRUCTIVE for M18 only: drops the nine M18 tables with their rows, the "DealStage" enum and
-- the four additive Call columns (their values are lost; Call rows themselves stay). No other
-- table loses a row. Revert prisma/schema.prisma, prisma/rls.sql, apply-order.txt and
-- src/modules/m18 in the same step. Export first if the rows matter, e.g.:
--   \copy (SELECT * FROM "Deal") TO 'm18-deal-backup.csv' CSV HEADER
--   \copy (SELECT * FROM "LeadOrganization") TO 'm18-lead-org-backup.csv' CSV HEADER
--
-- Children before parents so every drop is FK-clean (policies go with their table).
-- Idempotent: IF EXISTS throughout, a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "ServiceQuote";
DROP TABLE IF EXISTS "DealTask";
DROP TABLE IF EXISTS "DealActivity";
DROP TABLE IF EXISTS "Deal";
DROP TABLE IF EXISTS "LeadMatch";
DROP TABLE IF EXISTS "LeadContact";
DROP TABLE IF EXISTS "ServicePackage";
DROP TABLE IF EXISTS "FunderRule";
DROP TABLE IF EXISTS "LeadOrganization";
DROP TYPE IF EXISTS "DealStage";

ALTER TABLE "Call" DROP COLUMN IF EXISTS "eligibleApplicantTypes";
ALTER TABLE "Call" DROP COLUMN IF EXISTS "eligibleRegions";
ALTER TABLE "Call" DROP COLUMN IF EXISTS "cofinancingRateBp";
ALTER TABLE "Call" DROP COLUMN IF EXISTS "complexity";

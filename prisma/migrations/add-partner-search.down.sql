-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search.down.sql — rollback for add-partner-search.sql (FO-58)
--
-- DESTRUCTIVE: drops the six Partner Search tables with their rows, the five
-- enums, and the three CordisOrganization columns (hasActiveAnnouncements,
-- lastAnnouncementAt, portalProfileFetchedAt). No other CORDIS column or row
-- is touched. Revert prisma/schema.prisma, prisma/rls.sql and
-- scripts/rls-models.ts in the same step.
-- The announcement rows are re-fetchable from the portal; the quota counter is
-- the only tenant data. Export it first if it matters:
--   \copy (SELECT * FROM "PartnerSearchQuotaUsage") TO 'ps-quota-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON "PartnerSearchQuotaUsage";
DROP TABLE IF EXISTS "PartnerSearchQuotaUsage";
DROP TABLE IF EXISTS "PartnerSearchTopicStat";
DROP TABLE IF EXISTS "UnmatchedOrganization";
DROP TABLE IF EXISTS "PartnerSearchIngestionRun";
DROP TABLE IF EXISTS "PartnerProfileSnapshot";
DROP TABLE IF EXISTS "PartnerSearchAnnouncement";

ALTER TABLE "CordisOrganization" DROP COLUMN IF EXISTS "portalProfileFetchedAt";
ALTER TABLE "CordisOrganization" DROP COLUMN IF EXISTS "lastAnnouncementAt";
ALTER TABLE "CordisOrganization" DROP COLUMN IF EXISTS "hasActiveAnnouncements";

DROP TYPE IF EXISTS "PartnerSearchRunStatus";
DROP TYPE IF EXISTS "PartnerSearchRunTrigger";
DROP TYPE IF EXISTS "PartnerSearchSource";
DROP TYPE IF EXISTS "PartnerSearchOrgType";
DROP TYPE IF EXISTS "PartnerSearchAnnouncementType";

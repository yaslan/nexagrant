-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search-missed-scans.down.sql — rollback for add-partner-search-missed-scans.sql
--
-- Drops only the miss counter. Withdrawal already written (withdrawnAt) is kept.
-- Revert prisma/schema.prisma in the same step.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PartnerSearchAnnouncement" DROP COLUMN IF EXISTS "missedScans";

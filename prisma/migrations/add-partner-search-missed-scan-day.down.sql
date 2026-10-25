-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search-missed-scan-day.down.sql — rollback for add-partner-search-missed-scan-day.sql
--
-- Drops only the day marker. The counter stays; without the marker a second miss
-- on the same day counts again, which is the old behaviour. Revert
-- prisma/schema.prisma in the same step.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PartnerSearchAnnouncement" DROP COLUMN IF EXISTS "missedScanAt";

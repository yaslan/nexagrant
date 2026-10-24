-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-platform-setting.down.sql — rollback for add-platform-setting.sql (FO-60)
--
-- DESTRUCTIVE: drops the PlatformSetting table with its rows. Nothing else reads
-- it except the partner-search flag, which then falls back to OFF (its default).
-- Revert prisma/schema.prisma, prisma/rls.sql and scripts/rls-models.ts in the
-- same step.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "PlatformSetting";

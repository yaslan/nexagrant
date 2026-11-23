-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-report-deletion-log.down.sql — rollback for add-agency-report-deletion-log.sql (NG-341)
--
-- DESTRUCTIVE for this table only: drops "AgencyReportDeletionLog" with its rows (the records of
-- past report destructions, which the retention decision says to keep 3 years) and the purge
-- function. No report is restored: a destroyed report stays destroyed. Revert prisma/schema.prisma,
-- prisma/rls.sql, prisma/rls-app-role.sql step 3f, apply-order.txt and the retention job in the same
-- step. Export first, e.g.:
--   \copy (SELECT * FROM "AgencyReportDeletionLog") TO 'agency-report-deletion-log-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS, a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agency_report_purge(text, text, timestamptz);
DROP TABLE IF EXISTS "AgencyReportDeletionLog";

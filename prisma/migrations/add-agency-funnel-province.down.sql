-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-agency-funnel-province.sql (TASK-MULV3JXS1AW5X). Drops the
-- function only; no rows are touched. Idempotent. Run it before
-- add-tenant-province.down.sql. The app code of the same change calls this
-- function, so roll the code back with it.

DROP FUNCTION IF EXISTS public.agency_funnel_counts_by_province(timestamp without time zone);

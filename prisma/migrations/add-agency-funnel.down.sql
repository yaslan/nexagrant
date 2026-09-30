-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-agency-funnel.sql (TASK-MULRQSJFB8RWJ). Drops the function
-- only; no rows are touched. Idempotent.

DROP FUNCTION IF EXISTS public.agency_funnel_counts(timestamp without time zone);

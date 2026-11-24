-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-agency-report-deletion-log-prune-orphans.sql (NG-349): drops the function only.
-- No data is changed. Deploy the code rollback FIRST: the agency-report-retention job calls this
-- function after its per-agency loop; with the function gone that step fails and the job alerts
-- (the per-agency prune and the report purge are not affected). Records of hard-deleted agencies
-- then pile up again, as before NG-349. Idempotent: IF EXISTS.
DROP FUNCTION IF EXISTS public.agency_report_deletion_log_prune_orphans(timestamptz);

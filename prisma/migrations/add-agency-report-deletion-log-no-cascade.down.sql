-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-report-deletion-log-no-cascade.down.sql — rollback for NG-345
--
-- Drops the prune function and restores the ON DELETE CASCADE foreign key (the state before
-- NG-345). Restoring the FK FAILS while any record belongs to an agency that no longer exists:
-- delete those rows first (they are exactly what the FK would have removed), then rerun.
-- Records of existing agencies are untouched.
--
-- Idempotent: IF EXISTS / pg_constraint guard, a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agency_report_deletion_log_prune(text, timestamptz);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyReportDeletionLog_tenantId_fkey') THEN
    ALTER TABLE "AgencyReportDeletionLog" ADD CONSTRAINT "AgencyReportDeletionLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

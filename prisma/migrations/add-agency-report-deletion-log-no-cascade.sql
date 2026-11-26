-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-report-deletion-log-no-cascade.sql — NG-345 (decision K-585864 = A, 23.11.2026)
--
-- 1. Drops the foreign key "AgencyReportDeletionLog" → "Tenant" (ON DELETE CASCADE) that
--    add-agency-report-deletion-log.sql added in its first revision. Deleting an agency must
--    not delete the record that its reports were destroyed. "tenantId" stays a plain text
--    column, under the same RLS policy (tenant_isolation) as before.
--    Guarded by IF EXISTS: a fresh database never gets the FK (the original file no longer
--    adds it), an older one loses it here.
--
-- 2. public.agency_report_deletion_log_prune(tenant, cutoff): removes the caller's own
--    destruction records older than the cutoff. The retention is 3 years
--    (AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS); the database refuses a cutoff less than
--    3 years back, the same way agency_report_purge refuses one less than 12 months back.
--    Idempotent: a second run deletes nothing. Returns how many records it removed.
--    SECURITY DEFINER, but RLS still applies (FORCE): the function can only delete rows of
--    app.tenant_id, and it refuses any other tenant.
--
-- Rollback: prisma/migrations/add-agency-report-deletion-log-no-cascade.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AgencyReportDeletionLog" DROP CONSTRAINT IF EXISTS "AgencyReportDeletionLog_tenantId_fkey";

CREATE OR REPLACE FUNCTION public.agency_report_deletion_log_prune(p_tenant text, p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- "AgencyReportDeletionLog"."deletedAt" is TIMESTAMP(3) holding UTC; compare in UTC.
  cutoff_utc timestamp(3) := p_cutoff AT TIME ZONE 'UTC';
  n integer;
BEGIN
  IF p_tenant IS NULL OR btrim(p_tenant) = '' OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune: tenant and cutoff are required' USING ERRCODE = '22004';
  END IF;
  -- Only the agency's own session can prune its records.
  IF p_tenant IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune: tenant % is not the session tenant', p_tenant USING ERRCODE = '42501';
  END IF;
  -- The 3-year retention of the records (NG-345) is a floor the caller cannot cut.
  IF p_cutoff > now() - interval '3 years' THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune: cutoff % is less than 3 years back', p_cutoff USING ERRCODE = '42501';
  END IF;

  DELETE FROM "AgencyReportDeletionLog"
   WHERE "tenantId" = p_tenant
     AND "deletedAt" < cutoff_utc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.agency_report_deletion_log_prune(text, timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agency_report_deletion_log_prune(text, timestamptz) TO fabrika_app';
  END IF;
END $$;

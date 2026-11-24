-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-report-deletion-log-prune-orphans.sql — NG-349 (follow-up of NG-345)
--
-- NG-345 prunes the agency report destruction records ("AgencyReportDeletionLog") after
-- 3 years, agency by agency, under each agency's own session. The agency list comes from
-- "Tenant", so the records of an agency that was hard-deleted from "Tenant" (no FK since
-- K-585864) are never reached and pile up for ever.
--
-- public.agency_report_deletion_log_prune_orphans(cutoff): the one narrow door for those rows.
--   * Deletes ONLY records whose "tenantId" names no row in "Tenant" AND whose "deletedAt" is
--     older than the cutoff. Records of an existing agency (soft-deleted included) are never
--     touched here: those stay with agency_report_deletion_log_prune(tenant, cutoff).
--   * The 3-year retention is a floor the caller cannot cut: a cutoff less than 3 years back
--     is refused, exactly like agency_report_deletion_log_prune.
--   * Refused inside a tenant session (app.tenant_id set): it is the retention job's step,
--     run once after the per-agency loop, never a tenant's.
--   * No new role, no BYPASSRLS. SECURITY DEFINER runs as the table owner; RLS is still FORCEd
--     on the table, so the body turns app.system_scope on for the DELETE only (path 1 of
--     system_scope_open(): the caller holds the owner's privileges) and puts the previous value
--     back right after it — the close_own_province_routes pattern (NG-222, ADR-0009). The flag
--     alone opens nothing to fabrika_app (no seal); no purpose is entered. An error aborts the
--     transaction, which also reverts the flag.
--   * NOT EXISTS rather than NOT IN: same meaning here ("tenantId" and "Tenant"."id" are both
--     NOT NULL), and it cannot turn into "delete nothing" through a NULL.
--   * Idempotent: a second run deletes nothing. Returns how many records it removed.
--   * EXECUTE: PUBLIC, anon, authenticated revoked; fabrika_app granted by name.
--
-- Idempotent migration: CREATE OR REPLACE + REVOKE/GRANT. Touches no rows when applied. Additive.
-- Rollback: prisma/migrations/add-agency-report-deletion-log-prune-orphans.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agency_report_deletion_log_prune_orphans(p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  scope_was text := current_setting('app.system_scope', true);
  -- "AgencyReportDeletionLog"."deletedAt" is TIMESTAMP(3) holding UTC; compare in UTC.
  cutoff_utc timestamp(3) := p_cutoff AT TIME ZONE 'UTC';
  n integer;
BEGIN
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune_orphans: cutoff is required' USING ERRCODE = '22004';
  END IF;
  -- The retention job's step, not a tenant's: an agency session has no business here.
  IF nullif(current_setting('app.tenant_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune_orphans: not callable inside a tenant session' USING ERRCODE = '42501';
  END IF;
  -- The 3-year retention of the records (NG-345) is a floor the caller cannot cut.
  IF p_cutoff > now() - interval '3 years' THEN
    RAISE EXCEPTION 'agency_report_deletion_log_prune_orphans: cutoff % is less than 3 years back', p_cutoff USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.system_scope', 'on', true);
  DELETE FROM "AgencyReportDeletionLog" l
   WHERE l."deletedAt" < cutoff_utc
     AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = l."tenantId");
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
  RETURN n;
END
$fn$;

COMMENT ON FUNCTION public.agency_report_deletion_log_prune_orphans(timestamptz) IS
  'NG-349: deletes AgencyReportDeletionLog rows of agencies no longer in Tenant, older than a cutoff at least 3 years back. Refused in a tenant session. Opens app.system_scope for the DELETE only (owner path) and restores it. Returns the count.';

REVOKE ALL ON FUNCTION public.agency_report_deletion_log_prune_orphans(timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agency_report_deletion_log_prune_orphans(timestamptz) TO fabrika_app';
  END IF;
END $$;
-- NG-213 D-3: Supabase's default privileges grant EXECUTE on every NEW function to anon and
-- authenticated; REVOKE ... FROM PUBLIC does not touch those grants. Closed here, before rls.sql runs.
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.agency_report_deletion_log_prune_orphans(timestamptz) FROM %I', r);
  END LOOP;
END $$;

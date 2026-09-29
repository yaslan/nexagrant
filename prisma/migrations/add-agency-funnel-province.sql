-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-funnel-province.sql — TASK-MULV3JXS1AW5X (FB KAMU B2, il filtresi)
--
-- Purpose: the agency dashboard's province selector. Same counts as
-- agency_funnel_counts (add-agency-funnel.sql), one row per organisation type
-- AND province instead of per type alone. Tenant.province comes from
-- add-tenant-province.sql, which must run first.
--
-- Why a second function and not CREATE OR REPLACE of the first: the result
-- gains a column, and PostgreSQL refuses to change a function's return type in
-- place. Dropping and recreating agency_funnel_counts would make this file's
-- rollback re-create it word for word. The old function stays as it is (the
-- app no longer calls it; its live test still pins its behaviour) and can be
-- dropped in a later clean-up.
--
-- Everything else is copied from agency_funnel_counts and holds for the same
-- reasons: the agency is the CALLER's app.tenant_id, never a parameter; a
-- caller that is not a live AGENCY gets no rows; integers only, no tenant id,
-- name or content; province is NULL for an organisation that gave none. The
-- small-cell rule (<5) is applied in src/lib/agency/funnel.ts, now across both
-- dimensions, before anything reaches a browser.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT. Touches no rows.
-- Rollback: add-agency-funnel-province.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agency_funnel_counts_by_province(since timestamp without time zone)
RETURNS TABLE (
  org_type     text,
  province     text,
  registered   integer,
  saved_search integer,
  pipeline     integer,
  concept_note integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET app.system_scope = 'on'
AS $fn$
DECLARE
  agency text := nullif(current_setting('app.tenant_id', true), '');
BEGIN
  IF agency IS NULL OR NOT EXISTS (
    SELECT 1 FROM "Tenant" a
     WHERE a."id" = agency AND a."kind" = 'AGENCY' AND a."deletedAt" IS NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t."orgType"::text,
         t."province",
         count(*)::int,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "SavedSearch" s WHERE s."tenantId" = t."id"))::int,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "Opportunity" o WHERE o."tenantId" = t."id" AND o."deletedAt" IS NULL))::int,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "ConceptNote" c WHERE c."tenantId" = t."id"))::int
    FROM "Tenant" t
   WHERE t."agencyId" = agency
     AND t."deletedAt" IS NULL
     AND (since IS NULL OR t."createdAt" >= since)
   GROUP BY t."orgType", t."province";
END
$fn$;

COMMENT ON FUNCTION public.agency_funnel_counts_by_province(timestamp without time zone) IS
  'Funnel counts per organisation type and province for the calling AGENCY tenant (app.tenant_id). Returns integers only, never a tenant row. TASK-MULV3JXS1AW5X.';

REVOKE ALL ON FUNCTION public.agency_funnel_counts_by_province(timestamp without time zone) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agency_funnel_counts_by_province(timestamp without time zone) TO fabrika_app';
  END IF;
END $$;

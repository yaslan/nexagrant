-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-funnel.sql — TASK-MULRQSJFB8RWJ (FB KAMU B2, ajans panosu)
--
-- Purpose: an agency sees how far the organisations it brought in have gone
-- (docs/kamu/OKA-KANAL-ONERISI.md §4), as NUMBERS and nothing else.
--
-- The organisations are other tenants, so their rows are behind
-- tenant_isolation and the agency's own scope reads none of them. That is the
-- point, and it stays so: there is no policy on agencyId (B1). Instead this
-- one SECURITY DEFINER function counts on the agency's behalf and hands back
-- one row per organisation type with five integers. No tenant id, no name,
-- no title, no content ever leaves it.
--
-- Who is "the agency": the CALLER's app.tenant_id, never a parameter. A caller
-- cannot ask for another agency's funnel by passing its id. If the calling
-- tenant is not a live AGENCY the function returns no rows.
--
-- Cohort: organisations linked to the agency (Tenant.agencyId) and not deleted,
-- registered at or after `since` (NULL = all time). Each step counts
-- organisations of that cohort that have at least one:
--   saved_search  — SavedSearch                     (§4 step 3, K1)
--   pipeline      — Opportunity, not deleted         (§4 step 4, M5: G0 is the
--                   stage every opportunity starts in)
--   concept_note  — ConceptNote                      (§4 step 5, M2)
-- Karne (B6) and application outcomes (B7) are not counted here.
--
-- Small-cell masking (<5, docs/legal/agency-channel-notice-addendum.md §3.1) is
-- done in src/lib/agency/funnel.ts before anything reaches a browser. This
-- function is callable only by fabrika_app (the server), not by a person.
--
-- Scope: `SET app.system_scope = 'on'` is function-level, so PostgreSQL restores
-- the caller's value on exit, error included (same pattern and reasoning as
-- redeem_agency_invite in add-agency-invite-code.sql). search_path is pinned.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT. Running it twice changes
-- nothing. Rollback: add-agency-funnel.down.sql. Neither file touches rows.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agency_funnel_counts(since timestamp without time zone)
RETURNS TABLE (
  org_type     text,
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
   GROUP BY t."orgType";
END
$fn$;

COMMENT ON FUNCTION public.agency_funnel_counts(timestamp without time zone) IS
  'Funnel counts per organisation type for the calling AGENCY tenant (app.tenant_id). Returns integers only, never a tenant row. TASK-MULRQSJFB8RWJ.';

REVOKE ALL ON FUNCTION public.agency_funnel_counts(timestamp without time zone) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agency_funnel_counts(timestamp without time zone) TO fabrika_app';
  END IF;
END $$;

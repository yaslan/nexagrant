-- ─────────────────────────────────────────────────────────────────────────────
-- add-province-transfer-org-name.sql — NG-179 (after NG-175 D-1)
--
-- Purpose: the readiness form's transfer box (NG-179) shows the anonymous visitor the NAME of
-- the consultancy that serves the chosen province, before they tick the box. That name lives in
-- "ProvinceLeadRoute" → "Tenant". NG-175 (SEC NG-170 D-1) narrowed ProvinceLeadRoute's
-- system_scope policy to 'platform-admin' and 'cross-tenant-job' only, so the visitor's own
-- 'public-intake' scope reads 0 rows there and the box silently never appeared.
--
-- D-1 stays as it is: 'public-intake' does NOT get ProvinceLeadRoute back (that would hand the
-- whole map — every province, every targetTenantId — to any anonymous code path in that scope).
-- Instead this is the narrow exception, the same shape as lifetime_licence_count() (rls.sql):
--
--   * input  : one province name (exact match on "ProvinceLeadRoute"."province")
--   * output : one text, the tenant's NAME — no tenant id, no other column, no other province
--   * only the ACTIVE route, and only a tenant that may receive readiness leads — the same
--     condition as isIntakeTenant() (src/modules/m18/server/intake.ts): not deleted AND
--     (orgType = 'CONSULTANCY' OR kind = 'AGENCY'). Anything else → NULL.
--   * SECURITY DEFINER with a fixed search_path; it reads as the table owner, which RLS does not
--     bind on ProvinceLeadRoute (ENABLE, not FORCE) — exactly how lifetime_licence_count() reads
--     "LifetimeLicence". No app.system_scope flip (ADR-0009: scope is entered only through
--     enter_system_scope).
--   * EXECUTE: PUBLIC revoked, fabrika_app granted by name (also prisma/rls-app-role.sql §5 for a
--     role created later; rls.sql's block revokes anon/authenticated from every owned function).
--
-- If isIntakeTenant() changes, change this WHERE in the same PR
-- (tests/transfer-org-name.live.test.ts pins both against the same rows).
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT. Touches no rows. Additive.
-- Rollback: prisma/migrations/add-province-transfer-org-name.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.province_transfer_org_name(p_province text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t."name"
    FROM "ProvinceLeadRoute" r
    JOIN "Tenant" t ON t."id" = r."targetTenantId"
   WHERE r."province" = p_province
     AND r."active"
     AND t."deletedAt" IS NULL
     AND (t."orgType"::text = 'CONSULTANCY' OR t."kind"::text = 'AGENCY')
   LIMIT 1
$fn$;

COMMENT ON FUNCTION public.province_transfer_org_name(text) IS
  'NG-179: name of the consultancy an active route sends this province''s readiness leads to (isIntakeTenant condition), else NULL. Returns the NAME only — never a tenant id or another province. ProvinceLeadRoute itself stays closed to public-intake (NG-175 D-1).';

REVOKE ALL ON FUNCTION public.province_transfer_org_name(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.province_transfer_org_name(text) TO fabrika_app';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- add-public-lead-transfer-recipient.sql — NG-204 (SEC NG-203 O-A1)
--
-- Purpose: the readiness visitor ticks the transfer box under ONE organisation's name (NG-179).
-- Until now only "transferConsentVersion" and "transferConsentAt" were stored, so if the
-- province → organisation map moved between the form and the forward (or an unmatched lead was
-- forwarded again after a re-mapping) the lead could reach an organisation the visitor never saw.
-- This stores WHO the consent was given to, and gives the submit a way to learn it:
--
--   * "PublicLead"."transferConsentTenantId" : the tenant the consent names (no FK, like
--     "routedTenantId": the proof of consent must outlive a deleted tenant)
--   * "PublicLead"."transferConsentOrgName"  : the name the visitor saw, as stored at submit
--   * CHECK "PublicLead_transfer_recipient_check": both set or both NULL
--   * public.province_transfer_org(text) → (tenant_id, org_name): the same narrow SECURITY DEFINER
--     shape and the SAME WHERE as province_transfer_org_name(text) (add-province-transfer-org-name.sql,
--     isIntakeTenant()): one province in, at most one row out. The submit (server side, 'public-intake'
--     code path) needs the id to bind the consent; the id never leaves the server
--     (getTransferOrgName in fon-hazirlik/actions.ts still returns the name only). ProvinceLeadRoute
--     stays closed to 'public-intake' (NG-175 D-1).
--
-- forwardPublicLead forwards only when the map's target = "transferConsentTenantId"; otherwise the
-- lead is marked unmatched with routeReason 'consent_recipient_mismatch' (listed in
-- add-public-lead-route-consistency.sql's CHECK, which every apply re-runs before this file).
--
-- Existing rows: the new columns are NULL. A legacy row with transferConsent=true and no recipient is
-- therefore never forwarded (it is marked 'consent_recipient_mismatch'); none exist where
-- LEAD_TRANSFER_CONSENT_ENABLED was never on.
--
-- If isIntakeTenant() changes, change BOTH functions' WHERE in the same PR
-- (tests/transfer-org-name.live.test.ts pins them).
--
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS, constraint dropped and re-added by name,
-- CREATE OR REPLACE + REVOKE/GRANT. Touches no rows.
-- Rollback: prisma/migrations/add-public-lead-transfer-recipient.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "transferConsentTenantId" TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "transferConsentOrgName" TEXT;

ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_transfer_recipient_check";
ALTER TABLE "PublicLead" ADD CONSTRAINT "PublicLead_transfer_recipient_check" CHECK (
  ("transferConsentTenantId" IS NULL) = ("transferConsentOrgName" IS NULL)
);

CREATE OR REPLACE FUNCTION public.province_transfer_org(p_province text)
RETURNS TABLE (tenant_id text, org_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t."id", t."name"
    FROM "ProvinceLeadRoute" r
    JOIN "Tenant" t ON t."id" = r."targetTenantId"
   WHERE r."province" = p_province
     AND r."active"
     AND t."deletedAt" IS NULL
     AND (t."orgType"::text = 'CONSULTANCY' OR t."kind"::text = 'AGENCY')
   LIMIT 1
$fn$;

COMMENT ON FUNCTION public.province_transfer_org(text) IS
  'NG-204: id and name of the consultancy an active route sends this province''s readiness leads to (isIntakeTenant condition, same WHERE as province_transfer_org_name), else no row. Server-side only: binds the transfer consent to its recipient at submit. One province, at most one row. ProvinceLeadRoute itself stays closed to public-intake (NG-175 D-1).';

REVOKE ALL ON FUNCTION public.province_transfer_org(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.province_transfer_org(text) TO fabrika_app';
  END IF;
END $$;
-- NG-213 D-3: on Supabase the default privileges of the migrating role grant EXECUTE on every NEW
-- function to the Data API roles `anon` and `authenticated`; REVOKE ... FROM PUBLIC does not touch those
-- grants. rls.sql's loop removes them too, but it runs AFTER apply-migrations: close the window here.
-- The roles exist only on Supabase, hence the lookup. Idempotent (REVOKE of an absent grant is a no-op).
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.province_transfer_org(text) FROM %I', r);
  END LOOP;
END $$;

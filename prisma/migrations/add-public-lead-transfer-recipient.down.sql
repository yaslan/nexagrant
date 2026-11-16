-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-public-lead-transfer-recipient.sql. Refuses when any row recorded a recipient:
-- dropping the columns would erase proof of WHO the visitor agreed to send the request to.
-- Order matters: roll the CODE back first (forwardPublicLead reads these columns).
-- After this, the submit cannot bind a consent; with the old code back, the O-A1 gap is open again,
-- so keep LEAD_TRANSFER_CONSENT_ENABLED off.
-- Rows marked 'unmatched/consent_recipient_mismatch' are NOT touched here, and they only stay valid while
-- add-public-lead-route-consistency.sql keeps that reason in its list (NG-213 D-2). apply-migrations re-runs
-- that file on every apply: if the code rollback also reverts it to the pre-NG-204 list (git revert of
-- NG-204), the next apply STOPS there with "N PublicLead row(s) violate the route consistency rule".
-- Nothing is corrupted, but deploys are blocked. Procedure, in this order:
--   1. Count them (this file prints the count as a NOTICE):
--        SELECT count(*) FROM "PublicLead" WHERE "routeReason" = 'consent_recipient_mismatch';
--   2. 0 → nothing to do. >0 → keep 'consent_recipient_mismatch' in BOTH lists of
--      add-public-lead-route-consistency.sql (preflight and CHECK) when reverting; the old code never
--      writes the reason, the list only allows the rows that exist. Its UI label key
--      (admin/lead-routes reason_consent_recipient_mismatch) and the UnmatchedReason member in
--      src/core/contracts/lead-routing.ts stay with it, or the worklist shows a raw reason.
--   3. Do NOT rewrite those rows to another reason or to NULL to make the short list pass: NULL makes the
--      old code forward them to whoever the map names now, which is the O-A1 gap; another reason falsifies
--      the routing history. A deliberate per-row decision, by hand, is the only other way.
-- Idempotent: a second run (columns already gone) skips the guard instead of failing on them.
DO $$
DECLARE kept boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'PublicLead' AND column_name = 'transferConsentTenantId') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "PublicLead" WHERE "transferConsentTenantId" IS NOT NULL OR "transferConsentOrgName" IS NOT NULL)' INTO kept;
    IF kept THEN
      RAISE EXCEPTION 'PublicLead rows with a transfer consent recipient exist; export and clear them first';
    END IF;
  END IF;
END $$;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "PublicLead" WHERE "routeReason" = 'consent_recipient_mismatch';
  IF n > 0 THEN
    RAISE NOTICE 'add-public-lead-transfer-recipient.down: % PublicLead row(s) keep routeReason consent_recipient_mismatch; keep that reason in add-public-lead-route-consistency.sql (see the header of this file)', n;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.province_transfer_org(text);
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_transfer_recipient_check";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentOrgName";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentTenantId";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-public-lead-transfer-recipient.sql. Refuses when any row recorded a recipient:
-- dropping the columns would erase proof of WHO the visitor agreed to send the request to.
-- Order matters: roll the CODE back first (forwardPublicLead reads these columns).
-- After this, the submit cannot bind a consent; with the old code back, the O-A1 gap is open again,
-- so keep LEAD_TRANSFER_CONSENT_ENABLED off.
-- Rows already marked 'consent_recipient_mismatch' stay valid (that reason lives in
-- add-public-lead-route-consistency.sql's CHECK).
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
DROP FUNCTION IF EXISTS public.province_transfer_org(text);
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_transfer_recipient_check";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentOrgName";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentTenantId";

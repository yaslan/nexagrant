-- Rollback of add-public-lead-transfer-consent.sql. Refuses when any row recorded a transfer
-- consent: dropping the columns would erase proof of what the visitor agreed to.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PublicLead" WHERE "transferConsent" OR "transferConsentAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'PublicLead rows with a transfer consent exist; export and clear them first';
  END IF;
END $$;
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentAt";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentVersion";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsent";

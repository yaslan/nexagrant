-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-consent-purpose-lead-intake.sql (NG-138).
--
-- Postgres cannot drop one enum value, so the type is rebuilt without it. LEAD_INTAKE rows
-- are the proof that a visitor agreed to a transfer and cannot be rebuilt from anything
-- else, so this REFUSES to run while any exist. Export them first, then delete them on
-- purpose:
--   \copy (SELECT * FROM "Consent" WHERE "purpose" = 'LEAD_INTAKE') TO 'lead-intake-consent.csv' CSV HEADER
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'ConsentPurpose' AND e.enumlabel = 'LEAD_INTAKE') THEN
    IF EXISTS (SELECT 1 FROM "Consent" WHERE "purpose"::text = 'LEAD_INTAKE') THEN
      RAISE EXCEPTION 'Consent rows with purpose LEAD_INTAKE exist; export and delete them before rolling back';
    END IF;
    ALTER TYPE "ConsentPurpose" RENAME TO "ConsentPurpose_old";
    CREATE TYPE "ConsentPurpose" AS ENUM ('ACCOUNT_REGISTRATION', 'CALENDAR_OAUTH');
    ALTER TABLE "Consent" ALTER COLUMN "purpose" TYPE "ConsentPurpose" USING "purpose"::text::"ConsentPurpose";
    DROP TYPE "ConsentPurpose_old";
  END IF;
END $$;

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-decision-log-reactivate.sql (NG-241).
--
-- Postgres cannot drop one enum value, so DecisionKind is rebuilt without REACTIVATE. A
-- REACTIVATE row is the record of a decision and its reason and cannot be rebuilt from
-- anything else, so this REFUSES to run while any exist. Export them first, then delete them
-- on purpose:
--   \copy (SELECT * FROM "DecisionLog" WHERE "kind"::text = 'REACTIVATE') TO 'reactivate-decisions.csv' CSV HEADER
-- The two status columns are dropped; what they held is also in the opportunity.withdrawn /
-- opportunity.reactivated audit rows (data.from / data.to).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'DecisionKind' AND e.enumlabel = 'REACTIVATE') THEN
    IF EXISTS (SELECT 1 FROM "DecisionLog" WHERE "kind"::text = 'REACTIVATE') THEN
      RAISE EXCEPTION 'DecisionLog rows with kind REACTIVATE exist; export and delete them before rolling back';
    END IF;
    ALTER TYPE "DecisionKind" RENAME TO "DecisionKind_old";
    CREATE TYPE "DecisionKind" AS ENUM ('APPLY', 'WITHDRAW');
    ALTER TABLE "DecisionLog" ALTER COLUMN "kind" TYPE "DecisionKind" USING "kind"::text::"DecisionKind";
    DROP TYPE "DecisionKind_old";
  END IF;
END $$;

ALTER TABLE "DecisionLog" DROP COLUMN IF EXISTS "fromStatus";
ALTER TABLE "DecisionLog" DROP COLUMN IF EXISTS "toStatus";

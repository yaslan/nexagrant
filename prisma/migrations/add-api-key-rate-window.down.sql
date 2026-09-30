-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-api-key-rate-window.sql (TASK-MUN80XIW5NPV1).
-- Deploy the code without the counter first: src/lib/api-auth.ts writes these columns.
BEGIN;
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "rateWindowCount";
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "rateWindowStartedAt";
COMMIT;

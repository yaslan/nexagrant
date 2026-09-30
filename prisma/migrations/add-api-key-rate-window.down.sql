-- Rollback of add-api-key-rate-window.sql (TASK-MUN80XIW5NPV1).
-- Deploy the code without the counter first: src/lib/api-auth.ts writes these columns.
BEGIN;
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "rateWindowCount";
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "rateWindowStartedAt";
COMMIT;

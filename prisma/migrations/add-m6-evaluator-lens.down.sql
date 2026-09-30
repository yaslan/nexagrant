-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ============================================================================
-- ROLLBACK for add-m6-evaluator-lens.sql (TASK-MTPZH6T9L6E2E)
--
-- DESTRUCTIVE: drops Score, Criterion and Reviewer with all their rows, and
-- removes the v1.1 columns from Evaluation (proposalId / status / avgScore /
-- updatedAt values are lost). v1.0 Evaluation rows themselves survive intact.
--
-- Run only with an explicit human go-ahead. Take a dump first:
--   pg_dump "$DATABASE_URL" -t '"Evaluation"' -t '"Reviewer"' -t '"Criterion"' -t '"Score"' > m6-rollback-backup.sql
--
-- Apply: DATABASE_URL=<owner> scripts/apply-migrations.sh --down add-m6-evaluator-lens.down.sql
-- Idempotent: every statement is IF EXISTS, safe to run twice.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS "Score"     CASCADE;
DROP TABLE IF EXISTS "Criterion" CASCADE;
DROP TABLE IF EXISTS "Reviewer"  CASCADE;

ALTER TABLE "Evaluation" DROP CONSTRAINT IF EXISTS "Evaluation_proposalId_fkey";
DROP INDEX IF EXISTS "Evaluation_tenantId_proposalId_idx";
DROP INDEX IF EXISTS "Evaluation_tenantId_opportunityId_idx";

ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "proposalId";
ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "status";
ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "avgScore";
ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "updatedAt";

-- Restore the pre-M6 "caller must supply these" contract.
ALTER TABLE "Evaluation" ALTER COLUMN "readerType"     DROP DEFAULT;
ALTER TABLE "Evaluation" ALTER COLUMN "excellence"     DROP DEFAULT;
ALTER TABLE "Evaluation" ALTER COLUMN "impact"         DROP DEFAULT;
ALTER TABLE "Evaluation" ALTER COLUMN "implementation" DROP DEFAULT;

COMMIT;

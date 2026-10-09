-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-meeting-brief-opportunity.sql (TASK-MULQLQIE3ES6G).
--
-- Loses one thing: which opportunity each brief written after the migration was
-- for. The briefs themselves are kept; every one goes back to being listed on
-- every opportunity page of its tenant. Deploy the code without the column
-- first, or the running app fails on the missing column.
--
-- Idempotent: every statement is IF EXISTS guarded.

DROP INDEX IF EXISTS "MeetingBrief_tenantId_opportunityId_idx";
ALTER TABLE "MeetingBrief" DROP CONSTRAINT IF EXISTS "MeetingBrief_opportunityId_fkey";
ALTER TABLE "MeetingBrief" DROP COLUMN IF EXISTS "opportunityId";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../../migration-down-guard.sql

-- Rollback for topicmatch-per-opportunity/migration.sql.
--
-- DESTRUCTIVE, deliberately and unavoidably: the pre-migration shape allows exactly one
-- `TopicMatch` row per (tenantId, topicId), so returning to it means collapsing every
-- per-opportunity evidence row on a topic back into one. The newest row wins — which is precisely
-- the "last writer wins" behaviour this migration exists to end, i.e. the state being rolled back
-- to. The scores are derived, not source data: `pnpm jobs:g0-rescore` recomputes them.
--
-- Run it as written; it is idempotent (a second run finds nothing to collapse).

-- 1. Collapse duplicates: keep the most recently computed row per (tenantId, topicId).
DELETE FROM "TopicMatch" tm
USING (
  SELECT id,
         row_number() OVER (PARTITION BY "tenantId", "topicId" ORDER BY "computedAt" DESC, id DESC) AS rn
  FROM "TopicMatch"
) ranked
WHERE tm.id = ranked.id AND ranked.rn > 1;

-- 2. Back to the old key.
DROP INDEX IF EXISTS "TopicMatch_tenantId_opportunityId_idx";
DROP INDEX IF EXISTS "TopicMatch_tenantId_topicId_opportunityId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "TopicMatch_tenantId_topicId_key"
  ON "TopicMatch" ("tenantId", "topicId");

-- 3. Drop the link.
ALTER TABLE "TopicMatch" DROP CONSTRAINT IF EXISTS "TopicMatch_opportunityId_fkey";
ALTER TABLE "TopicMatch" DROP COLUMN IF EXISTS "opportunityId";

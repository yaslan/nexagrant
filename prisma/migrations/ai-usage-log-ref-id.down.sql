-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- ai-usage-log-ref-id.down.sql — rollback for ai-usage-log-ref-id.sql
--
-- LOSSY: the delivery markers are gone. Code that still runs the ai-reservation-orphans job
-- would then see no marker and refund nothing (it refuses to run without one), so the job is
-- safe, but it stops finding orphans. Roll the application code back in the same deploy (to
-- before NG-387).
--
-- Idempotent: DROP INDEX IF EXISTS, DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "AiUsageLog_module_createdAt_idx";
DROP INDEX IF EXISTS "AiUsageLog_tenantId_refId_idx";
ALTER TABLE "AiUsageLog" DROP COLUMN IF EXISTS "refId";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-ng-ai-quota-hold.down.sql — rollback for add-ng-ai-quota-hold.sql (NG-271)
--
-- Drops the in-flight holds of the NexaGrant monthly AI allowance. Not lossy in any lasting way:
-- a hold lives as long as one model call. Roll the application code back in the same deploy, or
-- generateCompletion fails on a table that is gone (every NexaGrant AI call is refused until then).
-- After the rollback the allowance is counted from AiUsageLog alone again (the NG-250 behaviour,
-- with its concurrency overshoot).
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "NgAiQuotaHold";

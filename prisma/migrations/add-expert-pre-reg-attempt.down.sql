-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-reg-attempt.down.sql — rollback for add-expert-pre-reg-attempt.sql
--
-- LOSSY: the submission counter rows are dropped (the per-IP window restarts at zero)
-- and lastSubmittedAt is dropped (the cooldown falls back to the link's issue time).
-- Roll the application code back in the same deploy, or the counter reads a table
-- that is gone.
--
-- Idempotent: DROP TABLE IF EXISTS, DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "ExpertPreRegAttempt";
ALTER TABLE "ExpertPreRegistration" DROP COLUMN IF EXISTS "lastSubmittedAt";

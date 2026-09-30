-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-feedback.down.sql — rollback for add-feedback.sql
--
-- DESTRUCTIVE: drops the Feedback table and every beta report in it. Export
-- first if the reports still matter:
--   \copy (SELECT * FROM "Feedback") TO 'feedback-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "Feedback";

DROP TYPE IF EXISTS "FeedbackStatus";
DROP TYPE IF EXISTS "FeedbackPriority";
DROP TYPE IF EXISTS "FeedbackImpact";
DROP TYPE IF EXISTS "FeedbackCategory";

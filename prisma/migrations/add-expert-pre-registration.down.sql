-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-registration.down.sql — rollback for add-expert-pre-registration.sql
--
-- LOSSY: every expert pre-registration is dropped, verified or not, with the
-- founder numbers already given out. Roll the application code back in the same
-- deploy (to before TASK-MVBIXPP33UK1B), or the form and the admin export fail.
--
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "ExpertPreRegistration";

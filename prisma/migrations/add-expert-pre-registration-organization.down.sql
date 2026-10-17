-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-registration-organization.down.sql — rollback for
-- add-expert-pre-registration-organization.sql (TASK-MVBLMIJW293GW · FO-25)
--
-- LOSSY: the "Kurum" answer of every expert who gave one is dropped. Roll the
-- application code back in the same deploy (to before FO-25), or the form sends
-- a field the old schema does not know.
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ExpertPreRegistration" DROP COLUMN IF EXISTS "organization";

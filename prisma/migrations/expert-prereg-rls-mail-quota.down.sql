-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- expert-prereg-rls-mail-quota.down.sql — rollback for expert-prereg-rls-mail-quota.sql
--
-- Restores the state before TASK-MVC6CTSCLO6LI (FO-45): no RLS on the table and
-- the quota columns gone. Only the quota counters are lost; nothing else changes.
-- Roll the application code back in the same deploy (to before FO-45): the code
-- reads verifyMailCount, and without RLS the code's system scope is simply unused.
--
-- Idempotent: DROP POLICY / DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS system_scope ON "ExpertPreRegistration";
ALTER TABLE "ExpertPreRegistration" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertPreRegistration" DROP COLUMN IF EXISTS "verifyMailWindowStart";
ALTER TABLE "ExpertPreRegistration" DROP COLUMN IF EXISTS "verifyMailCount";

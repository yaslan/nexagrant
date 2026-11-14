-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- public-lead-rls.down.sql — rollback for public-lead-rls.sql (NG-175)
--
-- Restores the state before NG-175: PublicLead with no policy and RLS off (policy-less
-- SYSTEM_WIDE, as add-public-lead.sql left it). No row is touched. Roll prisma/rls.sql and
-- scripts/rls-models.ts back in the same deploy: the NG-175 rls.sql ENABLEs the table again
-- on the next `pnpm db:rls`. The application code may stay: its system scopes simply have
-- nothing to open on a table without RLS.
--
-- Idempotent: DROP POLICY IF EXISTS; NO FORCE / DISABLE are no-ops when already off.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS system_scope ON "PublicLead";
ALTER TABLE "PublicLead" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PublicLead" DISABLE ROW LEVEL SECURITY;

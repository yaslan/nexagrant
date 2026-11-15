-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- expert-directory-view.down.sql — rollback for expert-directory-view.sql (NG-188)
--
-- Drops the view. It does NOT recreate NG-52's `expert_directory` policy: that policy lives in
-- prisma/rls.sql, so rolling back means reverting the NG-188 commit (prisma/rls.sql,
-- scripts/check-rls-live.ts, src/lib/expert-prereg/server/directory.ts) and running
-- `pnpm db:rls`, which recreates it from the reverted file. Between this file and that
-- `pnpm db:rls` the directory fails closed: the NG-188 directory.ts reads a view that is gone
-- (M8 hides the expert section, matching/page.tsx), the base table opens no row to
-- 'expert-directory', and no personal-data column is readable. Writing the old policy here
-- would bring the NG-185 F-1 finding back from a migration file, and a migration that puts a
-- policy on the app.system_scope flag without system_scope_open() is refused by
-- tests/rls-coverage.test.ts Y-1(a).
--
-- Idempotent: DROP VIEW IF EXISTS. No row is touched.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public."ExpertDirectoryEntry";

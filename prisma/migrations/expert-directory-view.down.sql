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
-- D-B2 (NG-203 review, NG-206): a checkout whose prisma/rls.sql still has NG-52's
-- `expert_directory` policy on "ExpertPreRegistration" (before NG-188), when run with `pnpm db:rls`
-- or `pnpm db:setup` against a database where this view is already applied, brings that policy
-- back. The sealed 'expert-directory' scope then reads fullName, email and ORCID again (NG-185
-- F-1). Old rls.sql re-applied = policy back: that is the expected rollback behaviour here, not a
-- bug. After merging NG-188 run `pnpm db:rls` on the shared database with the current rls.sql.
--
-- Idempotent: DROP VIEW IF EXISTS. No row is touched.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public."ExpertDirectoryEntry";

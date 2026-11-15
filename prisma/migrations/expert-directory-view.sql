-- ─────────────────────────────────────────────────────────────────────────────
-- expert-directory-view.sql — NG-188 (SEC NG-185 F-1b) · the M8 expert directory as a view
--
-- Purpose: NG-52's `expert_directory` SELECT policy on "ExpertPreRegistration" filtered ROWS,
-- not columns. Inside the sealed 'expert-directory' scope fabrika_app could read fullName,
-- email, orcid, linkedinUrl, ipHash and verifyTokenHash of every verified + consented expert
-- (NG-185 F-1, re-measured by NG-188 on an isolated database). The only caller,
-- listDirectoryExperts(), did not select them; the guard rested on that one caller.
-- Now the purpose reads the view "ExpertDirectoryEntry" (card columns only, same row
-- condition, security_barrier, not updatable, fabrika_app SELECT only) and the base-table
-- policy is dropped, so 'expert-directory' opens no row of ExpertPreRegistration at all.
-- Column GRANTs on the base table were not an option: public-intake reads and writes those
-- columns as fabrika_app. Full reasoning: prisma/rls.sql (same block, same text).
--
-- Order: the view calls public.system_scope_sealed(), which prisma/rls.sql creates. On a
-- database where rls.sql has not run yet the block is skipped with a NOTICE and rls.sql
-- creates the view at `pnpm db:rls`. Deploy: this migration and the directory.ts that reads
-- the view together; the old code reads the base table and would see 0 rows (the M8 page
-- hides the expert section, it does not fail).
--
-- Idempotent: DROP POLICY IF EXISTS, DROP VIEW IF EXISTS + CREATE VIEW, REVOKE/GRANT. No row is touched.
-- Rollback: prisma/migrations/expert-directory-view.down.sql (drops the view; the NG-52 policy
-- comes back only from a reverted prisma/rls.sql + `pnpm db:rls`).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_sealed()') IS NULL THEN
    RAISE NOTICE 'expert-directory-view: public.system_scope_sealed() missing; prisma/rls.sql creates the view at pnpm db:rls';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS expert_directory ON public."ExpertPreRegistration";
  -- DROP + CREATE, not CREATE OR REPLACE: a drifted view (an extra column) cannot be
  -- narrowed by OR REPLACE, so `pnpm db:rls` rebuilds it. Nothing depends on it; the
  -- grants are re-applied right below.
  DROP VIEW IF EXISTS public."ExpertDirectoryEntry";
  CREATE VIEW public."ExpertDirectoryEntry" WITH (security_barrier = true) AS
    SELECT e.id,
           e."founderNumber",
           e.province,
           e."isFreelancer",
           e.roles,
           e.programmes,
           e."expertiseAreas",
           e.languages,
           row_number() OVER (ORDER BY e."founderNumber" ASC NULLS LAST, e."createdAt" ASC, e.id ASC) AS "listOrder"
      FROM public."ExpertPreRegistration" e
     WHERE (SELECT coalesce(current_setting('app.system_scope', true) = 'on', false)
                   AND coalesce(current_setting('app.system_scope_purpose', true), '') = 'expert-directory'
                   AND public.system_scope_sealed())
       AND e.status = 'verified'
       AND e."visibilityConsentAt" IS NOT NULL;
  COMMENT ON VIEW public."ExpertDirectoryEntry" IS
    'NG-188: the M8 expert directory. Card columns only (no name, e-mail, ORCID, LinkedIn, IP or token), verified + visibility-consented rows only, and only inside a sealed enter_system_scope(''expert-directory''). Not updatable. fabrika_app: SELECT only.';
  REVOKE ALL ON public."ExpertDirectoryEntry" FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    REVOKE ALL ON public."ExpertDirectoryEntry" FROM fabrika_app;
    GRANT SELECT ON public."ExpertDirectoryEntry" TO fabrika_app;
  END IF;
END $$;

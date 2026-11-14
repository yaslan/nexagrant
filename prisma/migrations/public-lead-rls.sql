-- ─────────────────────────────────────────────────────────────────────────────
-- public-lead-rls.sql — NG-175 (SEC NG-170 O-1) · PublicLead under row level security
--
-- Purpose: "PublicLead" (the readiness visitor's name, e-mail, organisation and the
-- routing outcome routedTenantId) had no RLS since add-public-lead.sql. A tenant session
-- (fabrika_app + app.tenant_id) read every row: measured 6/6 by SEC NG-170 (S4), including
-- leads routed to another tenant. Now the one policy is `system_scope`, the same standing
-- as ExpertPreRegistration: fabrika_app sees 0 rows and cannot write outside
-- withSystemScope(). The four legitimate paths open it with the narrowest purpose:
--   submitPublicLead()   'public-intake'     (the anonymous form)
--   listPublicLeads()    'platform-admin'    (/admin/leads)
--   listUnmatchedLeads() 'platform-admin'    (the unmatched worklist)
--   forwardPublicLead()  'cross-tenant-job'  (the province forwarder)
--   purgeOldPublicLeads()'cross-tenant-job'  (the nightly retention purge)
-- prisma/rls.sql system_scope_open() opens PublicLead to those three purposes only, and
-- lets 'public-intake' reach it (NG-175). FORCE as well: the owner follows the policy too;
-- its owner path still needs app.system_scope = 'on', which scripts/apply-migrations.sh sets.
--
-- Order: the policy is only useful together with that new system_scope_open(). If this
-- runs before `pnpm db:rls` has installed it (the function does not mention PublicLead),
-- RLS is left as it is with a NOTICE, so the form never meets a policy its purpose cannot
-- open. rls.sql has the same block and turns it on at `pnpm db:rls`.
-- Deploy: application code first (the scoped calls work on a table without RLS), then this.
--
-- Idempotent: ENABLE/FORCE are no-ops when already set; DROP POLICY IF EXISTS before CREATE.
-- No row is touched.
-- Rollback: prisma/migrations/public-lead-rls.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL
     AND pg_get_functiondef('public.system_scope_open(regclass)'::regprocedure) LIKE '%"PublicLead"%' THEN
    ALTER TABLE public."PublicLead" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public."PublicLead" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."PublicLead";
    CREATE POLICY system_scope ON public."PublicLead"
      USING ((SELECT public.system_scope_open('"PublicLead"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"PublicLead"'::regclass)));
  ELSE
    RAISE NOTICE 'public-lead-rls: system_scope_open missing or older than NG-175 (rls.sql not yet applied); RLS left as it is until pnpm db:rls';
  END IF;
END $$;

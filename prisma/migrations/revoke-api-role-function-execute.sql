-- TASK-MUOG51GJ3PUOG R-S2 (+ crw2-fb Ö-2, TASK-MUPYHVSBW47GD): no function of
-- this schema is callable through Supabase's Data API roles.
--
-- Supabase's PostgREST runs requests as `anon` (no login) or `authenticated`
-- and exposes every function those roles may EXECUTE at /rest/v1/rpc/<name>.
-- PostgreSQL grants EXECUTE to PUBLIC on every new function, so three
-- functions that never revoke it were callable anonymously on the live
-- database (measured 01.10.2026):
--   lifetime_licence_count()     SECURITY DEFINER, the global licence count
--   system_scope_sealed()        SECURITY DEFINER, the RLS seal test
--   system_scope_open(regclass)  the system_scope policy predicate
-- The app never calls the Data API (no Supabase client in the code); the
-- policies call the two system_scope_* functions as the querying role, and
-- the pricing page calls lifetime_licence_count() as fabrika_app. So: PUBLIC
-- loses EXECUTE on the three, fabrika_app gets it by name.
--
-- Ö-2: Supabase's default privileges for `postgres` grant EXECUTE to anon and
-- authenticated on every function `postgres` creates in public. Our files
-- revoke PUBLIC only, which does not touch those explicit grants; run by
-- `postgres` instead of fabrika_migrate, the chain would leave every SECURITY
-- DEFINER function (redeem_agency_invite, enter_system_scope, ...) callable
-- anonymously. Step 2 revokes them from both roles on every function this
-- role owns in public, extension members excepted.
--
-- Only functions the running role owns (or holds the owner's privileges of)
-- are touched: on Supabase that leaves Supabase's own functions alone, and a
-- REVOKE by a non-owner would only warn. `anon`/`authenticated` exist only on
-- Supabase; elsewhere step 2 does nothing. system_scope_* are created by
-- prisma/rls.sql, which runs after this chain: on a fresh database step 1
-- finds them missing and rls.sql applies the same block (mirrored there).
-- Idempotent: REVOKE/GRANT of a privilege already absent/present is a no-op.
--
-- Checked by `pnpm rls:verify` (any owner function callable by anon or
-- authenticated → exit 1). Rollback: revoke-api-role-function-execute.down.sql.

DO $$
DECLARE
  f regprocedure;
  r text;
BEGIN
  -- 1. The three without a PUBLIC revoke: PUBLIC out, the app role in by name.
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lifetime_licence_count', 'system_scope_sealed', 'system_scope_open')
       AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO fabrika_app', f);
    END IF;
  END LOOP;

  -- 2. Supabase's API roles: nothing this role owns in public.
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    FOR f IN
      SELECT p.oid::regprocedure
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_has_role(current_user, p.proowner, 'USAGE')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
    END LOOP;
  END LOOP;
END $$;

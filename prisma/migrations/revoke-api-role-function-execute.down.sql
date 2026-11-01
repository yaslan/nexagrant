-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of revoke-api-role-function-execute.sql (TASK-MUOG51GJ3PUOG R-S2).
-- Puts EXECUTE back on PUBLIC for the three functions and drops the by-name
-- grant to fabrika_app (it had EXECUTE through PUBLIC before). This reopens
-- them to Supabase's anon/authenticated (/rest/v1/rpc) — the state before.
-- Step 2's revokes from anon/authenticated are NOT restored: they only removed
-- grants a default ACL had added, and putting them back would be the hole.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lifetime_licence_count', 'system_scope_sealed', 'system_scope_open')
       AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM fabrika_app', f);
    END IF;
  END LOOP;
END $$;

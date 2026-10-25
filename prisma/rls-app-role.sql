-- Fabrika: RLS-subject application role (fabrika_app).
--
-- Why this exists: the local `fabrika` role is SUPERUSER + BYPASSRLS, so the 36
-- tenant_isolation policies installed by prisma/rls.sql are never evaluated
-- locally. Any "RLS works" claim made through that role is meaningless. This
-- script adds a *separate* login role that is genuinely subject to the policies,
-- so tenant isolation can be measured instead of assumed.
--
-- Scope note: this does NOT change DATABASE_URL. It is wired up as
-- DATABASE_URL_RLS_TEST and used by tests/rls.spec.ts. Switching the app's main
-- connection to this role is a separate, later task.
--
-- The password is never stored in this file. It is read from the GUC
-- `fabrika.app_password`, which the caller sets in the same session:
--
--   psql "$DATABASE_URL" \
--     -c "select set_config('fabrika.app_password', 'the-password', false)" \
--     -f prisma/rls-app-role.sql
--
-- or, preferred:  pnpm db:rls-role     (scripts/setup-rls-role.ts)
--
-- Rollback: prisma/rls-app-role-rollback.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  app_role   text := 'fabrika_app';
  app_pw     text := current_setting('fabrika.app_password', true);
  keep_pw    boolean := coalesce(current_setting('fabrika.app_password_keep', true), '') = 'on';
  owner_role text;
  fn         regprocedure;
BEGIN
  -- 1. Role, idempotently. NOSUPERUSER + NOBYPASSRLS is the whole point.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    IF app_pw IS NULL OR app_pw = '' THEN
      RAISE EXCEPTION
        'fabrika.app_password is not set. Run: select set_config(''fabrika.app_password'', ''<pw>'', false); before this script.';
    END IF;
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
      app_role, app_pw
    );
    RAISE NOTICE 'created role %', app_role;
  ELSIF keep_pw THEN
    -- Keep mode (scripts/setup-rls-role.ts): attributes only, the password is
    -- owned by the .env that created the role and must not be rewritten here.
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
      app_role
    );
    RAISE NOTICE 'role % already existed; password kept, grants re-applied', app_role;
  ELSE
    -- Re-assert the attributes and rotate the password. Never widens privileges.
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
      app_role, app_pw
    );
    RAISE NOTICE 'role % already existed; attributes re-asserted', app_role;
  END IF;

  -- 2. Connect + schema access.
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);

  -- 3. DML on everything that exists today. No DDL, no TRUNCATE: an RLS-subject
  --    app role has no business reshaping or emptying tables.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
  --    Except DELETE on the founder-number counter: it only goes up, and a deleted
  --    row would let a purged founder number be handed out again (FO-50, crw-fb Ö-1).
  IF to_regclass('public."ExpertFounderCounter"') IS NOT NULL THEN
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public."ExpertFounderCounter" FROM %I', app_role);
  END IF;
  -- 3b. PlatformSetting is written only by set_platform_setting() (platform-setting-
  --     write-guard.sql, FO-65 F2). Step 3 above would grant DML again on a re-run.
  IF to_regclass('public."PlatformSetting"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON "PlatformSetting" FROM %I', app_role);
  END IF;

  -- 4. And on everything created later, per owning role. Prisma migrations run
  --    as fabrika (or fabrika_migrate); default privileges are recorded per
  --    grantor, so both owners are covered when they exist.
  FOR owner_role IN
    SELECT rolname FROM pg_roles WHERE rolname IN ('fabrika', 'fabrika_migrate')
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      owner_role, app_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
      owner_role, app_role
    );
  END LOOP;

  -- 5. The functions the RLS policies and the pricing page call as this role.
  --    PUBLIC has no EXECUTE on them (revoke-api-role-function-execute.sql);
  --    granted there and in rls.sql too, here for a role created after both.
  FOR fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lifetime_licence_count', 'system_scope_sealed', 'system_scope_open')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn, app_role);
  END LOOP;
END $$;

-- 6. Proof, printed by the script itself: the role must be neither superuser
--    nor bypassrls, or every downstream RLS assertion is worthless.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'fabrika_app';

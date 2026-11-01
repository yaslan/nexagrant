-- Rollback for prisma/rls-app-role.sql: removes the fabrika_app role and every
-- privilege granted to it. Destroys no data and touches no other role.
--
--   psql "$DATABASE_URL" -f prisma/rls-app-role-rollback.sql
--   (or: pnpm db:rls-role:rollback)
--
-- After running this, remove DATABASE_URL_RLS_TEST from .env; tests/rls.spec.ts
-- skips its isolation assertions when that variable is absent.

\set ON_ERROR_STOP on

DO $$
DECLARE
  app_role   text := 'fabrika_app';
  owner_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE NOTICE 'role % does not exist; nothing to do', app_role;
    RETURN;
  END IF;

  -- Default privileges must be revoked through the same grantor that granted
  -- them, otherwise DROP ROLE fails with "cannot be dropped because some
  -- objects depend on it".
  FOR owner_role IN
    SELECT rolname FROM pg_roles WHERE rolname IN ('fabrika', 'fabrika_migrate')
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM %I',
      owner_role, app_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM %I',
      owner_role, app_role
    );
  END LOOP;

  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM %I', current_database(), app_role);

  EXECUTE format('DROP ROLE %I', app_role);
  RAISE NOTICE 'dropped role %', app_role;
END $$;

SELECT count(*) AS fabrika_app_rows_left_in_pg_roles
FROM pg_roles WHERE rolname = 'fabrika_app';

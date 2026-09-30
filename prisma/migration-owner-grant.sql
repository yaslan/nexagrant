-- Migration owner: the one privilege scripts/apply-migrations.sh needs beyond
-- owning the schema. TASK-MUOEGWSV8I7H0 (İNCELEME-106 I-1).
--
-- Why: four SECURITY DEFINER functions carry `SET app.system_scope = 'on'`
-- (seven definitions in five forward files, the first in add-agency-invite-code.sql).
-- `app.system_scope` is a custom placeholder parameter, and PostgreSQL checks a
-- placeholder in a function's SET clause at CREATE time: only a superuser, or a
-- role granted SET on the parameter, may write it there. A plain `SET` in a
-- session needs nothing (every role, fabrika_app included, can already do
-- that), and calling the functions needs nothing either. Without this grant a
-- non-superuser owner stops the chain at file 23 with
--   permission denied to set parameter "app.system_scope"
-- BYPASSRLS does not help: this is a parameter check, not row security
-- (measured, docs/agent-results/TASK-MUOEGWSV8I7H0-se-fb.md).
--
-- Run once per database cluster, as a superuser, naming the role that runs
-- the chain (the schema owner, never the app role):
--
--   psql "$SUPERUSER_URL" -v owner=<migration-owner> -f prisma/migration-owner-grant.sql
--
-- What it adds: the owner may also put the parameter into `ALTER DATABASE/ROLE
-- ... SET`, which would open system_scope for every new session.
-- apply-migrations.sh refuses to finish while such a default exists. The owner
-- could already switch RLS off on its own tables, so this is not a new power
-- over tenant isolation, only a new place to look.
--
-- Rollback: prisma/migration-owner-grant-rollback.sql

\set ON_ERROR_STOP on

-- Without `-v owner=...` the `:'owner'` below is not substituted and psql
-- reports only `syntax error at or near ":"` (İNCELEME-115 Ö-5).
\if :{?owner}
\else
  DO $$ BEGIN
    RAISE EXCEPTION 'no migration owner given: psql "$SUPERUSER_URL" -v owner=<migration-owner> -f prisma/migration-owner-grant.sql';
  END $$;
\endif

SELECT set_config('fabrika.migration_owner', :'owner', false);

DO $$
DECLARE
  owner_role text := nullif(current_setting('fabrika.migration_owner', true), '');
BEGIN
  IF owner_role IS NULL OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
    RAISE EXCEPTION 'migration owner role % does not exist', coalesce(owner_role, '<unset>');
  END IF;
  -- The app role must never be able to write app.system_scope into a function
  -- or a database default: that is the tenant-isolation bypass in one statement.
  IF owner_role = 'fabrika_app' THEN
    RAISE EXCEPTION 'refusing to grant SET ON PARAMETER app.system_scope to the app role fabrika_app';
  END IF;
  EXECUTE format('GRANT SET ON PARAMETER app.system_scope TO %I', owner_role);
  RAISE NOTICE 'granted SET ON PARAMETER app.system_scope to %', owner_role;
END $$;

SELECT r.rolname,
       r.rolsuper,
       r.rolbypassrls,
       has_parameter_privilege(r.rolname, 'app.system_scope', 'SET') AS can_set_system_scope
  FROM pg_roles r
 WHERE r.rolname IN (current_setting('fabrika.migration_owner'), 'fabrika_app')
 ORDER BY 1;

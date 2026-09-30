-- Rollback of prisma/migration-owner-grant.sql. Run as a superuser:
--
--   psql "$SUPERUSER_URL" -v owner=<migration-owner> -f prisma/migration-owner-grant-rollback.sql
--
-- After this, a non-superuser owner can no longer run scripts/apply-migrations.sh
-- (it stops in the preflight, before any file).

\set ON_ERROR_STOP on

REVOKE SET ON PARAMETER app.system_scope FROM :"owner";

SELECT :'owner' AS rolname,
       has_parameter_privilege(:'owner', 'app.system_scope', 'SET') AS can_set_system_scope;

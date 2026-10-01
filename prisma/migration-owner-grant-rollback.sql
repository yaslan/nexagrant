-- Rollback of the former prisma/migration-owner-grant.sql (removed in
-- TASK-MUOG51GJ3PUOG: the chain no longer needs SET ON PARAMETER). Run it on a
-- cluster where that grant was given, as a superuser:
--
--   psql "$SUPERUSER_URL" -v owner=<migration-owner> -f prisma/migration-owner-grant-rollback.sql
--
-- scripts/apply-migrations.sh keeps working for the owner afterwards.

\set ON_ERROR_STOP on

REVOKE SET ON PARAMETER app.system_scope FROM :"owner";

SELECT :'owner' AS rolname,
       has_parameter_privilege(:'owner', 'app.system_scope', 'SET') AS can_set_system_scope;

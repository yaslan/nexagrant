-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of auditevent-immutable.sql (NG-40): gives fabrika_app back the DML
-- it had before (UPDATE, DELETE; TRUNCATE was never granted by rls-app-role.sql)
-- and removes audit_detach_actor(). Reopens the audit trail to rewriting.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "AuditEvent" TO fabrika_app';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.audit_detach_actor(text);

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for auditevent-null-system-only.sql (TASK-MULUJ8O4JH1PF).
--
-- Restores the shared policy of auditevent-tenant-or-shared.sql. Read this
-- before running it: it RE-OPENS the leak the forward file closed — every
-- tenant can again read every AuditEvent row with a NULL tenantId (plan admin
-- events, tenant-less KVKK/GDPR erasure and export records) and insert new
-- ones. Revert prisma/rls.sql and scripts/rls-models.ts (AuditEvent back into
-- NULLABLE_TENANT) in the same step. system_scope is left in place: it is
-- created for this table by prisma/rls.sql either way. No rows are touched.

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";
DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";
CREATE POLICY tenant_or_shared ON "AuditEvent"
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true));

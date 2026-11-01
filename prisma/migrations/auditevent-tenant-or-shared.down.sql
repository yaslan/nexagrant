-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for auditevent-tenant-or-shared.sql (TASK-MTU6HUB8FUHMG C-2).
--
-- Restores the strict policy. Read this before running it: under
-- `tenant_isolation` every AuditEvent row with a NULL tenantId becomes
-- invisible and unwritable again, which is the defect this migration fixed.
-- Any such row already written stays in the table but can no longer be read
-- through an RLS-subject role. Revert scripts/rls-models.ts (AuditEvent back
-- out of NULLABLE_TENANT) and prisma/rls.sql in the same step.

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";
DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";

CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

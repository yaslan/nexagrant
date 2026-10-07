-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-evidence-link-tenant-id.sql (TASK-MTU6HUB8FUHMG B-1).
--
-- Dropping the column drops the RLS policy's subject, so remove the policy
-- first — otherwise `pnpm db:rls` fails on the next run against a column that
-- is gone. Also revert scripts/rls-models.ts and prisma/rls.sql, or the static
-- gate will demand a policy for a table that can no longer carry one.
-- Idempotent; no row in any other table is touched.

DROP POLICY IF EXISTS tenant_isolation ON "ClaimEvidenceLink";
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReminder";
ALTER TABLE "ClaimEvidenceLink" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReminder"  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClaimEvidenceLink" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReminder"  DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "EvidenceReminder_sent_notifyAt_idx";
DROP INDEX IF EXISTS "EvidenceReminder_tenantId_idx";
DROP INDEX IF EXISTS "ClaimEvidenceLink_tenantId_idx";

ALTER TABLE IF EXISTS "EvidenceReminder" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "ClaimEvidenceLink" DROP COLUMN IF EXISTS "tenantId";

-- ─────────────────────────────────────────────────────────────────────────────
-- auditevent-tenant-or-shared.sql — TASK-MTU6HUB8FUHMG C-2
--
-- Purpose: `AuditEvent.tenantId` is `String?`, but the table carried the strict
-- `tenant_isolation` policy. In SQL `NULL = 'x'` is NULL, not true, so a row
-- with no tenant satisfied neither USING nor WITH CHECK: it could be neither
-- written nor read. src/actions/user/request-deletion.ts writes exactly such a
-- row when the erasure subject belongs to no tenant — so the audit trail for a
-- KVKK/GDPR erasure request was dropped silently, in the one case where the
-- record exists to prove the right was honoured.
--
-- Fix: the same `tenant_or_shared` policy Document / Chunk / ConceptTemplate
-- already use. It is not a widening for rows that HAVE a tenant — those still
-- match only their own `app.tenant_id`. It is narrower than nothing for rows
-- that do not: they become writable and readable instead of being lost.
--
-- No schema change: this is policy-only, and it is exactly what `pnpm db:rls`
-- now applies (prisma/rls.sql). This file exists so a database that will not be
-- re-run through rls.sql can be repaired on its own. Idempotent.
-- Rollback: prisma/migrations/auditevent-tenant-or-shared.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

-- The old policy must go, not merely be joined: permissive policies OR
-- together, so leaving it behind would keep an obsolete rule alive forever.
DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";
DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";

CREATE POLICY tenant_or_shared ON "AuditEvent"
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true));

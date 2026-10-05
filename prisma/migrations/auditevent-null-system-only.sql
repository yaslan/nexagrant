-- ─────────────────────────────────────────────────────────────────────────────
-- auditevent-null-system-only.sql — TASK-MULUJ8O4JH1PF
--
-- Purpose: an AuditEvent row with "tenantId" NULL belongs to NO tenant, so no
-- tenant may read or write it.
--
-- auditevent-tenant-or-shared.sql (TASK-MTU6HUB8FUHMG C-2) gave AuditEvent the
-- shared policy `"tenantId" IS NULL OR "tenantId" = app.tenant_id`. That kept
-- the tenant-less KVKK/GDPR erasure record writable, but it also made every
-- NULL row readable by every tenant and let any tenant session INSERT a NULL
-- row. Measured through fabrika_app before this file: tenant A read 331 of 331
-- NULL rows (plan.deleted / plan.visibility.changed, each with the platform
-- admin's actorId) and a forged NULL insert was accepted.
--
-- After this file:
--   * tenant_isolation, byte-identical to prisma/rls.sql: a tenant sees and
--     writes only its own rows. `NULL = 'x'` is NULL, so NULL rows are neither.
--   * system_scope, as prisma/rls.sql creates it for every policy-carrying
--     table: NULL rows are read and written inside withSystemScope() only
--     (erasure/export writers, plan-repository, /admin/audit). Since
--     TASK-MUOGMQK3JAH4Y that is rls.sql's sealed predicate, see below.
--   * tenant_or_shared is DROPPED. Permissive policies OR together, so leaving
--     it would keep the leak open.
--
-- No rows are changed or deleted: the erasure audit trail stays in the table.
-- Idempotent: every statement is DROP IF EXISTS + CREATE or a no-op ALTER.
-- Rollback: prisma/migrations/auditevent-null-system-only.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";
DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";
CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- prisma/rls.sql already creates this for AuditEvent; restated so a database
-- repaired with this file alone does not lose the only path to the NULL rows.
--
-- TASK-MUOGMQK3JAH4Y: never with the bare `app.system_scope = 'on'` test. That
-- GUC is USERSET, so fabrika_app could set it itself and read every row. Once
-- prisma/rls.sql has installed system_scope_open() this restates rls.sql's
-- exact policy; this file runs again on every scripts/apply-migrations.sh, and
-- the old wording here reopened AuditEvent after each run. On a database where
-- rls.sql has not run yet, only the table's owner gets through (the
-- apply-migrations session); the app's enter_system_scope() path opens when
-- `pnpm db:rls` runs, like every other system_scope policy.
DO $$
BEGIN
  DROP POLICY IF EXISTS system_scope ON "AuditEvent";
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    CREATE POLICY system_scope ON "AuditEvent"
      USING ((SELECT public.system_scope_open('"AuditEvent"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"AuditEvent"'::regclass)));
  ELSE
    CREATE POLICY system_scope ON "AuditEvent"
      USING (current_setting('app.system_scope', true) = 'on'
             AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = '"AuditEvent"'::regclass), 'USAGE'))
      WITH CHECK (current_setting('app.system_scope', true) = 'on'
             AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = '"AuditEvent"'::regclass), 'USAGE'));
  END IF;
END $$;

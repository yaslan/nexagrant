-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

BEGIN;

-- Rollback for drop-evidence-reminder.sql (TASK-MUXVOWBNIIQKD).
--
-- Recreates EvidenceReminder empty, in the shape it had in schema.prisma before
-- the drop (id, tenantId, evidenceId, notifyAt, sent, recipientEmails; FK to
-- Evidence with ON DELETE CASCADE; the two indexes add-evidence-link-tenant-id.sql
-- created), with the strict tenant_isolation policy, the system_scope policy and
-- the app role's grants. The rows are NOT recoverable from here; restore them
-- from a backup or export. Re-declare the model and `reminders` relation in
-- schema.prisma and put 'EvidenceReminder' back in prisma/rls.sql's list, or the
-- static gate will not see the table.
--
-- Idempotent: IF NOT EXISTS throughout and the policies are dropped before they
-- are created, so a second run exits 0.

CREATE TABLE IF NOT EXISTS "EvidenceReminder" (
  "id"              TEXT         NOT NULL,
  "tenantId"        TEXT         NOT NULL,
  "evidenceId"      TEXT         NOT NULL,
  "notifyAt"        TIMESTAMP(3) NOT NULL,
  "sent"            BOOLEAN      NOT NULL DEFAULT false,
  "recipientEmails" TEXT[],
  CONSTRAINT "EvidenceReminder_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceReminder_evidenceId_fkey'
  ) THEN
    ALTER TABLE "EvidenceReminder"
      ADD CONSTRAINT "EvidenceReminder_evidenceId_fkey"
      FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EvidenceReminder_tenantId_idx"        ON "EvidenceReminder" ("tenantId");
CREATE INDEX IF NOT EXISTS "EvidenceReminder_sent_notifyAt_idx"   ON "EvidenceReminder" ("sent", "notifyAt");

ALTER TABLE "EvidenceReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReminder" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReminder";
CREATE POLICY tenant_isolation ON "EvidenceReminder"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Same system_scope shape as drop-marketplace.down.sql: the sealed predicate
-- once system_scope_open() exists, otherwise owner-only behind the GUC.
DROP POLICY IF EXISTS system_scope ON "EvidenceReminder";
DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    CREATE POLICY system_scope ON "EvidenceReminder"
      USING ((SELECT public.system_scope_open('"EvidenceReminder"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"EvidenceReminder"'::regclass)));
  ELSE
    CREATE POLICY system_scope ON "EvidenceReminder"
      USING (current_setting('app.system_scope', true) = 'on'
             AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = '"EvidenceReminder"'::regclass), 'USAGE'))
      WITH CHECK (current_setting('app.system_scope', true) = 'on'
             AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = '"EvidenceReminder"'::regclass), 'USAGE'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "EvidenceReminder" TO fabrika_app;
  END IF;
END $$;

COMMIT;

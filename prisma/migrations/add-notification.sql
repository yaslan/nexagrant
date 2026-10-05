-- ─────────────────────────────────────────────────────────────────────────────
-- add-notification.sql — ADR-0011 notification store (TASK-MUVR24EHWI2RA)
--
-- Purpose: the bell and /notifications read from the server instead of an empty
-- list plus a localStorage overlay. One row per recipient; `readAt` is that
-- user's read state (K-1 a). Text is not stored: the UI renders it from `type`
-- and `payload` (ids and counts only).
--
-- Shape:
--   • `tenantId` NOT NULL      → strict `tenant_isolation`, written inside withTenant.
--   • `userId`                 → recipient. No FK, like SavedSearch.userId; the
--                                 erasure sweep deletes the rows by userId.
--   • UNIQUE (tenantId, userId, dedupeKey) → a producer that re-runs the same
--                                 window (alerts-daily after an SMTP failure)
--                                 writes nothing the second time. NULL keys do
--                                 not collide, so key-less rows are unaffected.
--   • FK tenantId → Tenant ON DELETE CASCADE: the rows go with the tenant.
--
-- Idempotency: every statement is IF NOT EXISTS, guarded by a DO block or
-- DROP-then-CREATE, so a second run changes nothing. Purely ADDITIVE.
-- Rollback: prisma/migrations/add-notification.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('SAVED_SEARCH_MATCH','CREDIT_GRANTED','CREDIT_EXHAUSTED','EVIDENCE_EXPIRING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "workspaceId" TEXT,
  "type"        "NotificationType" NOT NULL,
  "payload"     JSONB NOT NULL DEFAULT '{}',
  "dedupeKey"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"      TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_tenantId_userId_dedupeKey_key"
  ON "Notification" ("tenantId", "userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_userId_readAt_createdAt_idx"
  ON "Notification" ("tenantId", "userId", "readAt", "createdAt");
-- The retention sweep filters on createdAt alone, across tenants.
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"
  ON "Notification" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_tenantId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant isolation. Same shape as every other tenant-scoped table in
-- prisma/rls.sql, repeated here so applying this file alone leaves no window
-- where the table exists without a policy. User isolation is the application's
-- `where userId` (ADR-0011 K-5 a); there is no app.user_id setting.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Notification";
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Same reason as add-stripe-event-log: default privileges reach only roles that
-- existed when rls-app-role.sql last ran.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Notification" TO fabrika_app;
  END IF;
END $$;

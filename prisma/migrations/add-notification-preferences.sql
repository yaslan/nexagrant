-- ─────────────────────────────────────────────────────────────────────────────
-- add-notification-preferences.sql — NG-43 / TASK-MW2ST0NTYRRQW (spec §13, NG-22 E-1)
--
-- Purpose: the notification centre's channel and frequency choice, nothing else.
--   • NotificationPreference — one row per (tenant, user, §13 event, channel): INSTANT, WEEKLY
--                              or OFF. No row = the code default (panel INSTANT, e-mail OFF).
--   • NotificationEmailItem  — e-mail outbox: INSTANT rows go out one by one, WEEKLY rows as one
--                              digest per user (src/lib/notifications/email-outbox.ts), then
--                              they are deleted. type + payload only, no text.
-- Three new enum types; the §13 event list is NotificationEvent. NotificationType is NOT changed
-- (src/lib/notifications/events.ts maps it onto the §13 list).
--
-- Both tables get strict tenant_isolation here, in the wording of prisma/rls.sql, so applying this
-- file alone leaves no window without a policy. userId has no FK (Notification.userId pattern);
-- users-scheduled-deletion deletes both by userId, the tenant's deletion cascades.
--
-- Idempotency: enum types guarded by duplicate_object, tables/indexes IF NOT EXISTS, FKs guarded by
-- pg_constraint, policy DROP-then-CREATE. A second run, or a run after `prisma db push`, changes
-- nothing. Names are Prisma's own. Purely ADDITIVE: no existing table, column or row is touched.
-- Rollback: prisma/migrations/add-notification-preferences.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "NotificationEvent" AS ENUM (
    'NEW_MATCHING_CALL', 'CALL_CHANGED', 'OUTREACH_REPLY', 'CONTRIBUTION_OVERDUE', 'APPROVAL_OVERDUE',
    'BUDGET_DEVIATION', 'TASK_COLOR_CHANGED', 'REPORT_DUE', 'OBLIGATION_REMINDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('PANEL', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationFrequency" AS ENUM ('INSTANT', 'WEEKLY', 'OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "event"     "NotificationEvent" NOT NULL,
  "channel"   "NotificationChannel" NOT NULL,
  "frequency" "NotificationFrequency" NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_tenantId_userId_event_channel_key"
  ON "NotificationPreference"("tenantId", "userId", "event", "channel");

CREATE TABLE IF NOT EXISTS "NotificationEmailItem" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "payload"   JSONB NOT NULL DEFAULT '{}',
  "frequency" "NotificationFrequency" NOT NULL,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEmailItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEmailItem_tenantId_userId_dedupeKey_key"
  ON "NotificationEmailItem"("tenantId", "userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationEmailItem_frequency_createdAt_idx"
  ON "NotificationEmailItem"("frequency", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationEmailItem_tenantId_userId_idx"
  ON "NotificationEmailItem"("tenantId", "userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_tenantId_fkey') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationEmailItem_tenantId_fkey') THEN
    ALTER TABLE "NotificationEmailItem" ADD CONSTRAINT "NotificationEmailItem_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['NotificationPreference','NotificationEmailItem'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

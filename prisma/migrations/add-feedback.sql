-- ─────────────────────────────────────────────────────────────────────────────
-- add-feedback.sql — E11.2 Beta feedback & triage
--
-- Purpose: give beta design partners an in-product report channel that survives
-- an observability outage. The row is the record of truth; the Sentry forward
-- is best-effort and only stamps `sentryEventId` / `sentryStatus` on success.
--
-- Idempotency: every statement is IF NOT EXISTS / guarded by a DO block, so
-- re-running this file is a no-op. Purely ADDITIVE — nothing existing is
-- dropped, renamed or retyped.
--
-- Rollback: prisma/migrations/add-feedback.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "FeedbackCategory" AS ENUM ('BUG','FEATURE_REQUEST','UX','PERFORMANCE','DATA_QUALITY','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackImpact" AS ENUM ('BLOCKER','MAJOR','MINOR','IDEA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackPriority" AS ENUM ('P0','P1','P2','P3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackStatus" AS ENUM ('NEW','TRIAGED','IN_PROGRESS','RESOLVED','WONT_FIX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Feedback" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "userId"        TEXT,
  "workspaceSlug" TEXT,
  "category"      "FeedbackCategory" NOT NULL,
  "impact"        "FeedbackImpact"   NOT NULL DEFAULT 'MINOR',
  "priority"      "FeedbackPriority" NOT NULL DEFAULT 'P3',
  "autoPriority"  "FeedbackPriority" NOT NULL DEFAULT 'P3',
  "status"        "FeedbackStatus"   NOT NULL DEFAULT 'NEW',
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "triageReason"  TEXT,
  "pageUrl"       TEXT,
  "userAgent"     TEXT,
  "appVersion"    TEXT,
  "locale"        TEXT NOT NULL DEFAULT 'tr',
  "screenshotKey" TEXT,
  "sentryEventId" TEXT,
  "sentryStatus"  TEXT,
  "triageNote"    TEXT,
  "triagedById"   TEXT,
  "triagedAt"     TIMESTAMP(3),
  "resolvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Feedback_tenantId_createdAt_idx"          ON "Feedback" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_tenantId_status_priority_idx"    ON "Feedback" ("tenantId", "status", "priority");
CREATE INDEX IF NOT EXISTS "Feedback_priority_status_idx"             ON "Feedback" ("priority", "status");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx"                   ON "Feedback" ("createdAt");

COMMENT ON COLUMN "Feedback"."autoPriority"  IS 'What the triage rules decided. Kept when a human overrides priority, so rule accuracy is measurable.';
COMMENT ON COLUMN "Feedback"."triageReason"  IS 'Which rule fired (e.g. impact:BLOCKER, keyword:data-loss). Auditability for the P0-P3 verdict.';
-- rename-feedback-alert-columns.sql later renames this column to "alertStatus",
-- so on a second run it is gone and an unguarded COMMENT fails the file.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'Feedback' AND column_name = 'sentryStatus') THEN
    COMMENT ON COLUMN "Feedback"."sentryStatus" IS 'sent | skipped (no DSN) | failed. The DB row is the record of truth either way.';
  END IF;
END $$;
COMMENT ON COLUMN "Feedback"."screenshotKey" IS 'R2 object key. Never a public URL — the download URL is signed on demand.';

-- Tenant isolation. Same shape as every other tenant-scoped table in
-- prisma/rls.sql, repeated here so applying this file alone leaves no window
-- where the table exists without a policy.
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feedback" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Feedback";
CREATE POLICY tenant_isolation ON "Feedback"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

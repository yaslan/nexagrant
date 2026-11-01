-- ─────────────────────────────────────────────────────────────────────────────
-- add-soft-delete.sql — KVKK md.7/md.11 · GDPR art.17 (right to erasure)
--
-- Purpose: give the tables that carry personal or tenant data a soft-delete
-- marker so an erasure request starts a 30-day grace period instead of
-- destroying rows immediately. The irreversible purge is done by the
-- `users-scheduled-deletion` Inngest job once the window closes.
--
-- Idempotency: every statement uses IF NOT EXISTS, so re-running this file is a
-- no-op. It is purely ADDITIVE — no column is dropped, renamed or retyped, and
-- no existing row is touched (all new columns default to NULL = "not deleted").
--
-- Rollback: prisma/migrations/add-soft-delete.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- User: three columns. `deletionRequestedAt` is what starts the grace period
-- and what the purge job scans; `deletedAt` hides the account from the product
-- immediately; `deletionReason` records why (subject request, policy, ...).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt"           TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionReason"      TEXT;

ALTER TABLE "Tenant"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Tenant"       ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "Workspace"    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Workspace"    ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "Opportunity"  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Opportunity"  ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "Proposal"     ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Proposal"     ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "GateDecision" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "GateDecision" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "Effort"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Effort"       ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;

-- Indexes on the soft-delete markers: every "live rows only" filter and the
-- purge job's "past the grace period" scan hits these columns. They are plain
-- (not partial) b-tree indexes on purpose — this repo syncs schema with
-- `prisma db push`, and Prisma cannot express a partial index, so a partial one
-- would drift and be recreated on the next push. The matching @@index entries
-- live in prisma/schema.prisma.
CREATE INDEX IF NOT EXISTS "User_deletionRequestedAt_idx" ON "User" ("deletionRequestedAt");
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx"           ON "User" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Tenant_deletedAt_idx"         ON "Tenant" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Workspace_deletedAt_idx"      ON "Workspace" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Opportunity_deletedAt_idx"    ON "Opportunity" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Proposal_deletedAt_idx"       ON "Proposal" ("deletedAt");
CREATE INDEX IF NOT EXISTS "GateDecision_deletedAt_idx"   ON "GateDecision" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Effort_deletedAt_idx"         ON "Effort" ("deletedAt");

COMMENT ON COLUMN "User"."deletionRequestedAt" IS 'KVKK/GDPR erasure request time. NULL = no request. Purge job deletes 30 days after this.';
COMMENT ON COLUMN "User"."deletedAt"           IS 'Soft-delete marker. NULL = active. Set = hidden from product, still restorable during grace period.';
COMMENT ON COLUMN "User"."deletionReason"      IS 'Why the row was soft-deleted: subject_request | policy | tenant_cascade.';

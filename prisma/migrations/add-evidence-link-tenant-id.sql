-- ─────────────────────────────────────────────────────────────────────────────
-- add-evidence-link-tenant-id.sql — TASK-MTU6HUB8FUHMG B-1
--
-- Purpose: `ClaimEvidenceLink` and `EvidenceReminder` hold tenant data — each
-- row joins one tenant's Claim to that same tenant's Evidence, and
-- `EvidenceReminder.recipientEmails` is a list of that tenant's people. Neither
-- table had a `tenantId`, so neither had RLS, and both RLS gates listed them as
-- SYSTEM_WIDE and skipped them: the gate could not go red for either table.
-- RLS filters a column on the row; it does not walk the foreign key to
-- Evidence. So the column has to exist here.
--
-- Additive and safe on an empty table: `src/` contains no writer for either
-- model (only src/modules/m3/manifest.ts names them), so production holds zero
-- rows and NOT NULL needs no backfill. If a row *does* exist, the ALTER fails
-- loudly rather than inventing a tenant for it — which is the correct outcome.
--
-- Idempotency: IF NOT EXISTS throughout. Re-running is a no-op.
-- After this migration run `pnpm db:rls` — the policies live in prisma/rls.sql.
-- Rollback: prisma/migrations/add-evidence-link-tenant-id.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ClaimEvidenceLink" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;

CREATE INDEX IF NOT EXISTS "ClaimEvidenceLink_tenantId_idx" ON "ClaimEvidenceLink" ("tenantId");

-- EvidenceReminder was dropped later (drop-evidence-reminder.sql,
-- TASK-MUXVOWBNIIQKD). The chain reruns every file, so these statements run
-- only while the table still exists; on a database that never had it, or
-- after the drop, they are skipped and a rerun still exits 0.
DO $$
BEGIN
  IF to_regclass('"EvidenceReminder"') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "EvidenceReminder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
  CREATE INDEX IF NOT EXISTS "EvidenceReminder_tenantId_idx" ON "EvidenceReminder" ("tenantId");
  -- The reminder job sweeps unsent reminders that are due; it reads this pair.
  CREATE INDEX IF NOT EXISTS "EvidenceReminder_sent_notifyAt_idx" ON "EvidenceReminder" ("sent", "notifyAt");
END $$;

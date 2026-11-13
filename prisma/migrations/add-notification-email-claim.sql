-- ─────────────────────────────────────────────────────────────────────────────
-- add-notification-email-claim.sql — NG-131 (NG-43 review Ö-1)
--
-- Purpose: single-run guarantee for the notification e-mail outbox. A send run
--   claims the rows it is about to mail ("claimToken" + "claimedAt", set by one
--   atomic UPDATE ... WHERE claimToken IS NULL OR claimedAt < lease); a second run
--   that overlaps skips them, so a recipient gets ONE mail. Released on a failed
--   send; a claim older than the lease (a run that died) is reclaimable.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS; a second run, or a run after `prisma db push`,
-- changes nothing. Purely ADDITIVE and nullable: no existing row or query is touched,
-- RLS (tenant_isolation) already covers the table.
-- Rollback: prisma/migrations/add-notification-email-claim.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "NotificationEmailItem" ADD COLUMN IF NOT EXISTS "claimToken" TEXT;
ALTER TABLE "NotificationEmailItem" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- invitation-accepted-at.down.sql — rollback for invitation-accepted-at.sql
--
-- LOSSY for accepted rows: without the column an accepted invitation reads as
-- pending again and its link would be accepted a second time by code that
-- still knows the column. Roll the application code back in the same deploy
-- (to before TASK-MUN2793A57Z9I, where no accept path exists at all).
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Invitation" DROP COLUMN IF EXISTS "acceptedAt";

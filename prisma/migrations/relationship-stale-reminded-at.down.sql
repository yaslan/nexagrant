-- ─────────────────────────────────────────────────────────────────────────────
-- relationship-stale-reminded-at.down.sql — rollback for relationship-stale-reminded-at.sql
--
-- LOSSY: without the column the job cannot tell which stale relationships it
-- already mailed, so code that still knows the column would remind every one
-- of them again. Roll the application code back in the same deploy (to before
-- TASK-MULQL2NYKRGJX, where no reminder job exists).
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Relationship" DROP COLUMN IF EXISTS "staleRemindedAt";

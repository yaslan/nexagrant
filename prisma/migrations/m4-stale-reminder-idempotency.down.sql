-- ─────────────────────────────────────────────────────────────────────────────
-- m4-stale-reminder-idempotency.down.sql — rollback for m4-stale-reminder-idempotency.sql
--
-- LOSSY: drops the per-day claim and the "which contact" stamp. Code that
-- still reads either column fails; roll the application back to before this
-- file in the same deploy. The previous code keys on "staleRemindedAt" alone,
-- which this rollback leaves in place, so it resumes with its old behaviour
-- (and the two İNCELEME-51 defects).
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Relationship" DROP COLUMN IF EXISTS "staleRemindedContactAt";
ALTER TABLE "Membership" DROP COLUMN IF EXISTS "staleDigestOn";

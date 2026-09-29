-- ─────────────────────────────────────────────────────────────────────────────
-- add-public-lead.down.sql — rollback for add-public-lead.sql
--
-- LOSSY: every contact request left on the readiness result screen is dropped.
-- Roll the application code back in the same deploy (to before
-- TASK-MULR765AR5G0C), or the form, the admin list and the cleanup job fail.
--
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "PublicLead";

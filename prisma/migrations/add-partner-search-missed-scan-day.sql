-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search-missed-scan-day.sql — FO-60 / TASK-MVCH2J271U5VY (review fix 2)
--
-- Purpose: `missedScans` counted runs, not scans. Two runs on the same day (the
-- 03:00 nightly and the K1 incremental, or a re-run after a failed run) both saw
-- the same gap and withdrew the row after one real miss. This column stores the
-- UTC day of the last counted miss; a second miss on that same day is not counted.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Additive only; every existing row stays NULL.
-- Rollback: add-partner-search-missed-scan-day.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PartnerSearchAnnouncement"
  ADD COLUMN IF NOT EXISTS "missedScanAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search-missed-scans.sql — FO-60 / TASK-MVCH2J271U5VY
--
-- Purpose: the ingestor marks an announcement withdrawn when it is absent from
-- two consecutive scans of its topic. This column counts those consecutive misses
-- (reset to 0 the moment the announcement is seen again).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Additive only; no existing row changes
-- beyond the DEFAULT 0 that every row gets.
-- Rollback: add-partner-search-missed-scans.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PartnerSearchAnnouncement"
  ADD COLUMN IF NOT EXISTS "missedScans" INTEGER NOT NULL DEFAULT 0;

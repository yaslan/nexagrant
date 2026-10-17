-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-founder-counter.down.sql — rollback for add-expert-founder-counter.sql
--
-- Drops the founder-number counter. LOSSY when the purge has already deleted the
-- row that held the highest founder number: the old code's `max(founderNumber)+1`
-- would hand that number out again. Before running it, note the counter
-- (SELECT "lastNumber" FROM "ExpertFounderCounter") and roll the application code
-- back in the same deploy (to before FO-50 K-568932), whose purge keeps the top row.
--
-- Idempotent: DROP TABLE IF EXISTS (its policy goes with it).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "ExpertFounderCounter";

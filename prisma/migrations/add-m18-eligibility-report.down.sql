-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-m18-eligibility-report.down.sql — rollback for add-m18-eligibility-report.sql (NG-136)
--
-- DESTRUCTIVE for this table only: drops "LeadEligibilityReport" with its rows (the AI
-- eligibility pre-reports; their AiUsageLog rows and credit ledger entries stay). No other table
-- loses a row. Revert prisma/schema.prisma, prisma/rls.sql, apply-order.txt and the M18-F5 code
-- in the same step. Export first if the rows matter, e.g.:
--   \copy (SELECT * FROM "LeadEligibilityReport") TO 'm18-eligibility-report-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS, a second run is a no-op (the policy and the status CHECK go with the table).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "LeadEligibilityReport";

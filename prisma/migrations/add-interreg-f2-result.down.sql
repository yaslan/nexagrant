-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-f2-result.down.sql — rollback for add-interreg-f2-result.sql (FO-188)
--
-- Drops the two columns. LOSSY: the programme-check verdicts and every evidence
-- quote but the first (kept in evidenceQuote / evidenceLocator) are gone; the
-- report Markdown still carries them. Roll the application back to before FO-188
-- in the same deploy — evaluate.ts writes both columns. Export first if it matters:
--   \copy (SELECT "analysisId", "programChecks" FROM "InterregAnalysisResult") TO 'interreg-checks.csv' CSV HEADER
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "InterregCriterionMark" DROP COLUMN IF EXISTS "evidence";
ALTER TABLE "InterregAnalysisResult" DROP COLUMN IF EXISTS "programChecks";

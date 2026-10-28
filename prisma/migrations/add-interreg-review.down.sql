-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-review.down.sql — rollback for add-interreg-review.sql (FO-186)
--
-- DESTRUCTIVE: drops the five M17 tables (three tenant tables, the two rubric tables) with their rows and the two enums.
-- No other table is touched. Revert prisma/schema.prisma and prisma/rls.sql in
-- the same step. The rows are extracted text of user uploads (kept 30 days at
-- most) and F2 reports; the rubric rows are re-created by prisma/seed-interreg-rubrics.ts; the users still hold the original files. Export first
-- if it matters:
--   \copy (SELECT id, "tenantId", "userId", status, "createdAt" FROM "InterregAnalysis") TO 'interreg-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "InterregCriterionMark";
DROP TABLE IF EXISTS "InterregAnalysisResult";
DROP TABLE IF EXISTS "InterregAnalysis";
DROP TABLE IF EXISTS "InterregRubricCriterion";
DROP TABLE IF EXISTS "InterregRubric";

DROP TYPE IF EXISTS "InterregDocFormat";
DROP TYPE IF EXISTS "InterregAnalysisStatus";

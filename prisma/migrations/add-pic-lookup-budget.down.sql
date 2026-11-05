-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-pic-lookup-budget.down.sql — rollback for add-pic-lookup-budget.sql (FO-389)
--
-- DESTRUCTIVE: drops the table with its daily counts. Revert src/lib/pic-budget.ts,
-- prisma/schema.prisma, prisma/rls.sql and scripts/rls-models.ts in the same step,
-- or the profile form fails closed on its first unsolicited PIC question.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "PicLookupBudget";

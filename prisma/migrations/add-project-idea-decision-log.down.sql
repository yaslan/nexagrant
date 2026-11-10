-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-project-idea-decision-log.down.sql — rollback for add-project-idea-decision-log.sql (NG-38)
--
-- DESTRUCTIVE: drops ProjectIdea and DecisionLog with their rows, and the two enum types. No other
-- table loses a row. Opportunity rows already set to WITHDRAWN stay WITHDRAWN (that value existed
-- before this file); only their reasons go. The Opportunity (id, tenantId) unique index is NOT
-- dropped: add-org-readiness-tables.sql owns it. Revert prisma/schema.prisma, prisma/rls.sql and
-- apply-order.txt in the same step. Export first if it matters:
--   \copy (SELECT * FROM "DecisionLog") TO 'decision-log-backup.csv' CSV HEADER
--   \copy (SELECT * FROM "ProjectIdea") TO 'project-idea-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "DecisionLog";
DROP TABLE IF EXISTS "ProjectIdea";
DROP TYPE IF EXISTS "DecisionKind";
DROP TYPE IF EXISTS "ProjectIdeaStatus";

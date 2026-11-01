-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-systemalert-console-indexes.sql.
-- Drops only the indexes it created; no row is touched. Idempotent.

DROP INDEX IF EXISTS "SystemAlert_resolvedAt_createdAt_idx";
DROP INDEX IF EXISTS "SystemAlert_source_createdAt_idx";
DROP INDEX IF EXISTS "SystemAlert_createdAt_idx";

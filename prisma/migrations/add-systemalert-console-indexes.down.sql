-- Rollback for add-systemalert-console-indexes.sql.
-- Drops only the indexes it created; no row is touched. Idempotent.

DROP INDEX IF EXISTS "SystemAlert_resolvedAt_createdAt_idx";
DROP INDEX IF EXISTS "SystemAlert_source_createdAt_idx";
DROP INDEX IF EXISTS "SystemAlert_createdAt_idx";

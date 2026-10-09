-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- evidence-unique-object-key.down.sql — rollback for evidence-unique-object-key.sql
--
-- Drops the unique index. Nothing is lost; a double confirm can again make two
-- rows for one stored object (İNCELEME-66 D-3) — the action's `already_confirmed`
-- answer depends on this index.
--
-- Idempotent: DROP INDEX IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "Evidence_tenantId_r2ObjectKey_key";

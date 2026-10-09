-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-invoice.sql. DESTRUCTIVE: drops every issued invoice record.
-- An invoice is a fiscal document; dropping the table is not a routine undo and
-- needs an explicit decision, not a reflex.
BEGIN;
DROP TABLE IF EXISTS "Invoice";
COMMIT;

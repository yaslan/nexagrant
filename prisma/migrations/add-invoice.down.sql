-- Rollback for add-invoice.sql. DESTRUCTIVE: drops every issued invoice record.
-- An invoice is a fiscal document; dropping the table is not a routine undo and
-- needs an explicit decision, not a reflex.
BEGIN;
DROP TABLE IF EXISTS "Invoice";
COMMIT;

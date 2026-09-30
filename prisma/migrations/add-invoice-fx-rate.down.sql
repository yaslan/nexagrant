-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-invoice-fx-rate.sql.
--
-- DESTRUCTIVE for evidence, not for the invoices themselves: the rows survive,
-- but every issued foreign-currency invoice loses the TCMB rate and the TL
-- equivalent it was issued under, and those cannot be recovered by re-fetching
-- (TCMB publishes today's rate, not the rate a past document was issued at).
-- After this runs, any USD/EUR invoice already in the table becomes a document
-- that may no longer be filed (`foreignCurrencyFilingBlock`).
--
-- Export the FX columns before running it if any foreign-currency invoice
-- exists:
--   SELECT "id","number","currency","fxRate","fxRateDate","fxRateSource","grandTotalTryMinor"
--     FROM "Invoice" WHERE "currency" <> 'TRY';
--
-- Idempotent: IF EXISTS throughout.

BEGIN;

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_fx_required_for_foreign_currency";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "grandTotalTryMinor";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "fxRateSource";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "fxRateDate";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "fxRate";

COMMIT;

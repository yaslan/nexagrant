-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-evidence-scan-status.sql (NG-239).
--
-- Deploy the code rollback FIRST: the download route, the upload actions and the scan jobs read
-- and write these columns, so with them gone those paths fail.
--
-- DESTRUCTIVE for the scan results only: the four columns are dropped with their data. The
-- files themselves are untouched (an INFECTED file was already deleted from the store by the
-- scan job; its row stays, only the record of why goes). Idempotent: IF EXISTS.

DROP INDEX IF EXISTS "Evidence_tenantId_scanStatus_idx";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "scanAttempts";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "scanSignature";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "scannedAt";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "scanStatus";
DROP TYPE IF EXISTS "EvidenceScanStatus";

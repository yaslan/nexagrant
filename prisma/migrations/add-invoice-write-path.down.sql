-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-invoice-write-path.sql.
--
-- DESTRUCTIVE in one respect: dropping "TenantBillingIdentity" throws away every
-- buyer fiscal identity a tenant supplied, and there is no other copy of it —
-- the frozen `Invoice.buyer*` snapshots only cover tenants that were actually
-- invoiced. Issued invoices themselves are untouched.
--
-- Dropping `Invoice.paymentRef` removes the per-payment idempotency guard, after
-- which a redelivered webhook can issue a duplicate invoice for a payment that
-- was already invoiced. Do not run this on an environment taking payments.
BEGIN;
DROP INDEX IF EXISTS "Invoice_tenantId_paymentRef_key";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "paymentRef";
DROP TABLE IF EXISTS "TenantBillingIdentity";
COMMIT;

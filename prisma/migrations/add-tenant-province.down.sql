-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-tenant-province.sql (TASK-MULV3JXS1AW5X).
--
-- DESTRUCTIVE: dropping the column discards every province an organisation
-- entered at registration or in its settings. Roll back
-- add-agency-funnel-province.sql FIRST: its function reads this column and
-- would fail on every call once the column is gone. Idempotent.

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_province_check";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "province";

-- Rollback for add-tenant-province.sql (TASK-MULV3JXS1AW5X).
--
-- DESTRUCTIVE: dropping the column discards every province an organisation
-- entered at registration or in its settings. Roll back
-- add-agency-funnel-province.sql FIRST: its function reads this column and
-- would fail on every call once the column is gone. Idempotent.

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_province_check";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "province";

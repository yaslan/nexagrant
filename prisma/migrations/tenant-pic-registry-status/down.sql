-- Rollback for tenant-pic-registry-status/migration.sql.
--
-- DESTRUCTIVE for the stored lookup answers only: the two columns are dropped with their data.
-- The answers are derived (a fresh lookup re-creates them); dropping them removes the no-history
-- grant from every partner until the lookup runs again. Idempotent: IF EXISTS.

ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "picRegistryCheckedAt";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "picRegistryStatus";

-- FO-396 — Tenant.picRegistryStatus / picRegistryCheckedAt: the answer of the EU participant
-- register (ec.europa.eu funding-tenders orgProfile) for the tenant's PIC.
--
-- Why: the no-history partner "ortak kolaylığı" (FO-384 / FO-382) was granted to any partner with
-- zero CORDIS participations, including a typed-in PIC that is not registered at all. The scorer
-- now grants it only when the register says FOUND. Values: 'FOUND' | 'NOT_FOUND' | 'UNKNOWN'.
-- NULL = never checked (and therefore no grant), which is also every existing row.
--
-- RLS: no new table; Tenant is a system-wide table (no RLS policy), so nothing changes there.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, no backfill, no default. A second run is a
-- no-op. Rollback: down.sql.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "picRegistryStatus" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "picRegistryCheckedAt" TIMESTAMP(3);

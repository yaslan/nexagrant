-- ─────────────────────────────────────────────────────────────────────────────
-- add-marketplace-order.sql — TASK-MTVUQXSYL0X2H
--
-- Purpose: `orderMarketplaceService` (src/modules/marketplace/server/actions.ts)
-- minted a random order id, returned an object shaped like a confirmation, and
-- persisted nothing — there was no `MarketplaceOrder` model to write to.
-- `listingId` was never checked against the database either: any string from
-- the browser was accepted as a real listing, and `priceAmountEUR` came
-- straight from the client, so the buyer could name their own price. This
-- migration adds the table the fixed action writes to.
--
-- Amounts are `Int` minor units + `currency` (CLAUDE.md rule 9,
-- src/lib/money.ts) — `totalAmountMinor` is derived from the listing's price
-- server-side, never taken from the request.
--
-- RLS: tenant-scoped on the BUYER's tenant (`tenantId`), so it joins the
-- `tenant_isolation` loop in prisma/rls.sql. Applying this file alone is NOT
-- enough — run `pnpm db:rls` after it (`pnpm rls:check` / `pnpm rls:verify`
-- fail until the policy is both declared and live). The ENABLE/FORCE/POLICY
-- statements are repeated here, in rls.sql's exact wording, so a database
-- repaired with this file alone is never left without isolation (scripts/
-- rls-migrations.ts checks new tables for this in the same file that creates
-- them — three tables shipped without it in TASK-MTVDSSJTZCY4T).
--
-- Rollback: prisma/migrations/add-marketplace-order.down.sql
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "listingId"         TEXT NOT NULL,
  "sellerTenantId"    TEXT NOT NULL,
  "totalAmountMinor"  INTEGER NOT NULL,
  "platformFeeMinor"  INTEGER NOT NULL,
  "payoutAmountMinor" INTEGER NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'EUR',
  "status"            TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- "MarketplaceListing" came from schema.prisma, never from a migration, and left
-- it with ADR-0005. On a database built from today's schema it does not exist,
-- so the key is added only where the table is (TASK-MULU7SAA4EPP8). Nothing is
-- lost: drop-marketplace.sql, later in prisma/migrations/apply-order.txt, drops
-- this table again.
DO $$
BEGIN
  IF to_regclass('"MarketplaceListing"') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceOrder_listingId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceOrder"
      ADD CONSTRAINT "MarketplaceOrder_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_tenantId_idx" ON "MarketplaceOrder" ("tenantId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_listingId_idx" ON "MarketplaceOrder" ("listingId");

ALTER TABLE "MarketplaceOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketplaceOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MarketplaceOrder";
CREATE POLICY tenant_isolation ON "MarketplaceOrder"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

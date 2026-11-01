-- TASK-MTR882HVZ8BG7 — record the price a subscription was joined at.
--
-- The pricing page promises, in both catalogues, that "the price you join at
-- stays yours" (`billingPanels.pricing.heroSubtitle`). Nothing backed it:
-- `Subscription` held planId/status/interval/provider/period and no trace of the
-- campaign a tenant bought under, so every quote — the settings billing panel
-- and `POST /api/billing/checkout` alike — came from `getActiveTier()`, the
-- campaign running *now*. Measured on the code before this migration: Pro
-- monthly joined under ILK5 costs $26.10; with the campaign over the same
-- tenant is quoted $87.00. 3.33×, on a sentence that says the opposite.
--
-- Additive and idempotent: five nullable columns, no default, no backfill.
-- A row with all five NULL is a subscription sold before the lock existed; it
-- keeps being priced at the shopfront tier, because what it was actually sold
-- at was never recorded and inventing it could raise the customer's rate.
--
-- Why columns and not a `SubscriptionPriceLock` table: `Subscription` is one
-- row per tenant (tenantId is the primary key) and the lock is a property of
-- that one live contract, not an event stream. A separate table would need a
-- "which row is current" rule that can disagree with the subscription row it
-- describes; a column cannot disagree with itself. History is not lost —
-- `AuditEvent` records every subscription write and now carries the lock in its
-- payload, so "what rate did we honour on date X" stays answerable. RLS needs
-- no change either: `Subscription` is already in the tenant_isolation list in
-- prisma/rls.sql, and columns inherit the row's policy.
--
-- Down migration: add-subscription-price-lock.down.sql (drops the columns and
-- with them every recorded rate — destructive, needs an explicit yes).

BEGIN;

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lockedTierCode"    TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lockedPercentOff"  INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lockedAmountMinor" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lockedCurrency"    TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "priceLockedAt"     TIMESTAMP(3);

-- The lock is whole or absent: a half-written lock must never price anything.
-- `src/lib/billing/price-lock.ts` refuses to read one, and this keeps the
-- database from holding one in the first place.
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_price_lock_complete";
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_price_lock_complete" CHECK (
  (
    "lockedTierCode"    IS NULL AND "lockedPercentOff"  IS NULL AND
    "lockedAmountMinor" IS NULL AND "lockedCurrency"    IS NULL AND
    "priceLockedAt"     IS NULL
  ) OR (
    "lockedTierCode"    IS NOT NULL AND "lockedPercentOff"  IS NOT NULL AND
    "lockedAmountMinor" IS NOT NULL AND "lockedCurrency"    IS NOT NULL AND
    "priceLockedAt"     IS NOT NULL AND
    "lockedPercentOff"  BETWEEN 0 AND 100 AND
    "lockedAmountMinor" >= 0
  )
);

COMMIT;

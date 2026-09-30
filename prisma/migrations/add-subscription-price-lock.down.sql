-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for add-subscription-price-lock.sql.
--
-- DESTRUCTIVE: dropping these columns discards the rate every subscriber was
-- joined at, and it cannot be recomputed — `getActiveTier()` only knows the
-- campaign running today. Run it only if the feature is being withdrawn, and
-- export the columns first if any live subscription carries a lock:
--
--   \copy (SELECT "tenantId","lockedTierCode","lockedPercentOff","lockedAmountMinor","lockedCurrency","priceLockedAt" FROM "Subscription" WHERE "lockedTierCode" IS NOT NULL) TO 'price-locks.csv' CSV HEADER

BEGIN;

ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_price_lock_complete";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "priceLockedAt";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "lockedCurrency";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "lockedAmountMinor";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "lockedPercentOff";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "lockedTierCode";

COMMIT;

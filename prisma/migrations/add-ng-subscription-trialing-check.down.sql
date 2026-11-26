-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-ng-subscription-trialing-check.down.sql — rollback for add-ng-subscription-trialing-check.sql (NG-250)
--
-- Not destructive: drops the CHECK only, no row is touched. Revert the status guard in
-- src/lib/billing/nexagrant/repository.ts in the same step only if it is wanted gone too.
-- Idempotent: IF EXISTS, a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "NgSubscription" DROP CONSTRAINT IF EXISTS "NgSubscription_trialing_has_end_check";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-nexagrant-plan-catalog.down.sql — rollback for add-nexagrant-plan-catalog.sql (NG-57)
--
-- DESTRUCTIVE for these five tables only: drops "NgSubscription" (every tenant's NexaGrant plan
-- and trial dates) and the four catalogue tables with their rows (re-created by the seed on the
-- next `pnpm db:setup`; prices entered by hand are lost). No other table loses a row. Revert
-- prisma/schema.prisma, prisma/rls.sql, prisma/rls-app-role.sql, apply-order.txt and the
-- src/lib/billing/nexagrant code in the same step. Export first if the rows matter, e.g.:
--   \copy (SELECT * FROM "NgSubscription") TO 'ng-subscription-backup.csv' CSV HEADER
--   \copy (SELECT * FROM "NgPlanPrice") TO 'ng-plan-price-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS, a second run is a no-op (policies, CHECKs and indexes go with the tables).
-- Order: the subscription and policy tables reference NgPlan, so they go first.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "NgSubscription";
DROP TABLE IF EXISTS "NgTrialPolicy";
DROP TABLE IF EXISTS "NgPlanPrice";
DROP TABLE IF EXISTS "NgPlanFeature";
DROP TABLE IF EXISTS "NgPlan";

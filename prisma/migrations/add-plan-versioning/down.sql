-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../../migration-down-guard.sql

-- Rollback for add-plan-versioning.sql. Drops the versioning layer and returns
-- Plan/Subscription to their pre-versioning shape. Subscriptions keep planId,
-- so a tenant still has a plan after the rollback — only the exact terms it was
-- sold under are lost, which is the state the system was in before this task.
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_planVersionId_fkey";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "planVersionId";
DROP TABLE IF EXISTS "PlanAssignment";
DROP TABLE IF EXISTS "PlanFeature";
DROP TABLE IF EXISTS "PlanVersion";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "visibility";

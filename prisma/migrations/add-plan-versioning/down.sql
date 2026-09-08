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

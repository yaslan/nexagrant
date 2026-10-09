-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-soft-delete.down.sql — rollback for add-soft-delete.sql
--
-- DESTRUCTIVE: dropping these columns discards every pending erasure request.
-- Before running it, check that nothing is mid-grace-period:
--   SELECT count(*) FROM "User" WHERE "deletionRequestedAt" IS NOT NULL;
-- A non-zero count means subjects have asked for erasure and the record of that
-- request would be lost. Export it before dropping.
--
-- Idempotent: IF EXISTS everywhere, safe to run twice.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "User_deletionRequestedAt_idx";
DROP INDEX IF EXISTS "User_deletedAt_idx";
DROP INDEX IF EXISTS "Tenant_deletedAt_idx";
DROP INDEX IF EXISTS "Workspace_deletedAt_idx";
DROP INDEX IF EXISTS "Opportunity_deletedAt_idx";
DROP INDEX IF EXISTS "Proposal_deletedAt_idx";
DROP INDEX IF EXISTS "GateDecision_deletedAt_idx";
DROP INDEX IF EXISTS "Effort_deletedAt_idx";

ALTER TABLE "User"         DROP COLUMN IF EXISTS "deletionRequestedAt";
ALTER TABLE "User"         DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "User"         DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Tenant"       DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Tenant"       DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Workspace"    DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Workspace"    DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Opportunity"  DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Opportunity"  DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Proposal"     DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Proposal"     DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "GateDecision" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "GateDecision" DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Effort"       DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Effort"       DROP COLUMN IF EXISTS "deletionReason";

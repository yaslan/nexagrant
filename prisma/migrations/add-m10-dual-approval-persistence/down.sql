-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../../migration-down-guard.sql

-- Rollback for add-m10-dual-approval-persistence. Drops the durable approval
-- steps; the final signature (`FollowupDoc.signedAt`) is untouched.
DROP TABLE IF EXISTS "DualApprovalStep";
ALTER TABLE "FollowupDoc"
  DROP COLUMN IF EXISTS "approvalSubmittedAt",
  DROP COLUMN IF EXISTS "approvalSubmittedById",
  DROP COLUMN IF EXISTS "approvalSubmittedByName";

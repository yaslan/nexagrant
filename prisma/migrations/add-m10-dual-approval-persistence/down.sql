-- Rollback for add-m10-dual-approval-persistence. Drops the durable approval
-- steps; the final signature (`FollowupDoc.signedAt`) is untouched.
DROP TABLE IF EXISTS "DualApprovalStep";
ALTER TABLE "FollowupDoc"
  DROP COLUMN IF EXISTS "approvalSubmittedAt",
  DROP COLUMN IF EXISTS "approvalSubmittedById",
  DROP COLUMN IF EXISTS "approvalSubmittedByName";

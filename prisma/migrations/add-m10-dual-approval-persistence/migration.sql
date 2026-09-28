-- TASK-MTSAIWF4ENUSL — make the M10 dual approval steps durable.
--
-- Before this migration the intermediate steps of the flow lived only in React
-- state: finance approved, the page was reloaded, and the approval was gone.
-- `FollowupDoc.signedAt` was the single durable fact, so steps 2 and 3 of the
-- four-step banner were an in-memory claim.
--
-- The submission that opens the flow is stored on the document itself; the two
-- department sign-offs are rows in DualApprovalStep. Both four-eyes rules are
-- unique indexes rather than application checks:
--   (followupDocId, department)  — one sign-off per department
--   (followupDocId, actorUserId) — one department per person

ALTER TABLE "FollowupDoc"
  ADD COLUMN IF NOT EXISTS "approvalSubmittedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvalSubmittedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "approvalSubmittedByName" TEXT;

CREATE TABLE IF NOT EXISTS "DualApprovalStep" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "followupDocId" TEXT NOT NULL,
    "department"    TEXT NOT NULL,
    "actorUserId"   TEXT NOT NULL,
    "actorName"     TEXT NOT NULL,
    "note"          TEXT,
    "decidedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DualApprovalStep_pkey" PRIMARY KEY ("id")
);

-- A department signs a document once.
CREATE UNIQUE INDEX IF NOT EXISTS "DualApprovalStep_followupDocId_department_key"
    ON "DualApprovalStep"("followupDocId", "department");

-- And one person signs at most one department of the same document: this index
-- is what makes "dual" mean two people rather than two clicks.
CREATE UNIQUE INDEX IF NOT EXISTS "DualApprovalStep_followupDocId_actorUserId_key"
    ON "DualApprovalStep"("followupDocId", "actorUserId");

CREATE INDEX IF NOT EXISTS "DualApprovalStep_tenantId_followupDocId_idx"
    ON "DualApprovalStep"("tenantId", "followupDocId");

-- ADD CONSTRAINT has no IF NOT EXISTS, hence the guard (TASK-MULU7SAA4EPP8):
-- without it a second run, or a run after `prisma db push`, fails here.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'DualApprovalStep_followupDocId_fkey'
                   AND conrelid = '"DualApprovalStep"'::regclass) THEN
    ALTER TABLE "DualApprovalStep"
      ADD CONSTRAINT "DualApprovalStep_followupDocId_fkey"
      FOREIGN KEY ("followupDocId") REFERENCES "FollowupDoc"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant isolation. prisma/rls.sql is the source of truth and re-creates this
-- policy on every `pnpm db:rls`; it is stated here too so a database built from
-- migrations alone is never briefly readable across tenants.
ALTER TABLE "DualApprovalStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DualApprovalStep" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DualApprovalStep";
CREATE POLICY tenant_isolation ON "DualApprovalStep"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

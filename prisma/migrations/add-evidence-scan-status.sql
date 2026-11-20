-- ─────────────────────────────────────────────────────────────────────────────
-- add-evidence-scan-status.sql — NG-239 (Şartname §18.3, K-584154 = A, K-584192 = C)
--
-- Purpose: an uploaded evidence file used to go from the type/size check straight to the
-- store and out through the download route, unscanned. Every Evidence row now records where
-- its virus scan stands, and only CLEAN downloads (src/lib/evidence-scan-gate.ts):
--
--   scanStatus     PENDING | CLEAN | INFECTED | ERROR   (NOT NULL, default PENDING)
--   scannedAt      when clamd last answered (or failed to)
--   scanSignature  the signature clamd reported for an INFECTED file
--   scanAttempts   failed scan attempts so far (the retry chain's position)
--
-- Existing rows: every one becomes PENDING, including files uploaded before this change.
-- Deliberate (fail closed): an old file is not "clean" because it is old. The
-- `evidence-scan-sweep` job queues a scan for each, so they download again once clamd has
-- answered OK. Until then their download answers 409.
--
-- RLS: no new table. Evidence already carries the tenant_isolation policy (prisma/rls.sql);
-- the new columns are covered by it. `pnpm rls:check` still runs over it.
--
-- Additive and idempotent: the enum is created only if missing (duplicate_object), every
-- column with ADD COLUMN IF NOT EXISTS, the index with IF NOT EXISTS. A second run changes
-- nothing. Rollback: add-evidence-scan-status.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "EvidenceScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "scanStatus" "EvidenceScanStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3);
ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "scanSignature" TEXT;
ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "scanAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Evidence_tenantId_scanStatus_idx" ON "Evidence" ("tenantId", "scanStatus");

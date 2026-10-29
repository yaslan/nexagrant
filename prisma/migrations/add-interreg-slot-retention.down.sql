-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-slot-retention.down.sql — rollback for add-interreg-slot-retention.sql (FO-195)
--
-- Restores the single `textExpiresAt`, filled with the LATER of the two slot expiries
-- (the old rule kept the text until 30 days after the last upload). Drops the two
-- per-slot columns, their indexes and the pairing CHECK. Texts the job has already
-- purged stay purged. Revert prisma/schema.prisma and the m17-text-retention job
-- registration (src/lib/jobs) in the same step.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS throughout; the restore reads the slot columns
-- only while they exist.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "InterregAnalysis" ADD COLUMN IF NOT EXISTS "textExpiresAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'InterregAnalysis' AND column_name = 'callTextExpiresAt') THEN
    UPDATE "InterregAnalysis"
       SET "textExpiresAt" = GREATEST("callTextExpiresAt", "projectTextExpiresAt")
     WHERE "textExpiresAt" IS NULL AND ("callTextExpiresAt" IS NOT NULL OR "projectTextExpiresAt" IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InterregAnalysis_textExpiresAt_idx" ON "InterregAnalysis"("textExpiresAt");

ALTER TABLE "InterregAnalysis" DROP CONSTRAINT IF EXISTS "InterregAnalysis_text_expiry_pair";
DROP INDEX IF EXISTS "InterregAnalysis_callTextExpiresAt_idx";
DROP INDEX IF EXISTS "InterregAnalysis_projectTextExpiresAt_idx";
ALTER TABLE "InterregAnalysis"
  DROP COLUMN IF EXISTS "callTextExpiresAt",
  DROP COLUMN IF EXISTS "projectTextExpiresAt";

-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-slot-retention.sql — M17 text retention per slot (FO-195, B1/B5)
--
-- Purpose: the 30-day promise on extracted document text (owner decision, ADR-0010)
-- is counted from EACH slot's own upload (lead decision 2026-10-28, B5): the call
-- guide and the project file expire separately. One shared `textExpiresAt` moved
-- forward on every upload, so a call guide kept alive by re-uploading the project
-- file outlived its 30 days. This replaces it with `callTextExpiresAt` and
-- `projectTextExpiresAt`, read by the nightly `m17-text-retention` job.
--
-- Backfill: a slot that holds text expires 30 days after its own `…ExtractedAt`.
-- `textExpiresAt` is dropped: M17 has not been released (FO-186 is unmerged), so no
-- reader outside this PR uses it.
--
-- CHECK `…_text_expiry_pair`: a slot has text exactly when it has an expiry, so no
-- text can be written that the purge would never see.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the backfill only fills NULLs, the constraint
-- is added once, DROP … IF EXISTS. Rollback: add-interreg-slot-retention.down.sql.
-- No new table, so no RLS change: InterregAnalysis keeps its FORCE policy.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "InterregAnalysis"
  ADD COLUMN IF NOT EXISTS "callTextExpiresAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "projectTextExpiresAt" TIMESTAMP(3);

UPDATE "InterregAnalysis"
   SET "callTextExpiresAt" = COALESCE("callExtractedAt", "updatedAt") + INTERVAL '30 days'
 WHERE "callText" IS NOT NULL AND "callTextExpiresAt" IS NULL;

UPDATE "InterregAnalysis"
   SET "projectTextExpiresAt" = COALESCE("projectExtractedAt", "updatedAt") + INTERVAL '30 days'
 WHERE "projectText" IS NOT NULL AND "projectTextExpiresAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregAnalysis_text_expiry_pair') THEN
    ALTER TABLE "InterregAnalysis" ADD CONSTRAINT "InterregAnalysis_text_expiry_pair"
      CHECK (("callText" IS NULL) = ("callTextExpiresAt" IS NULL)
         AND ("projectText" IS NULL) = ("projectTextExpiresAt" IS NULL));
  END IF;
END $$;

-- The purge scans only rows that still hold text.
CREATE INDEX IF NOT EXISTS "InterregAnalysis_callTextExpiresAt_idx"
  ON "InterregAnalysis"("callTextExpiresAt") WHERE "callTextExpiresAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "InterregAnalysis_projectTextExpiresAt_idx"
  ON "InterregAnalysis"("projectTextExpiresAt") WHERE "projectTextExpiresAt" IS NOT NULL;

DROP INDEX IF EXISTS "InterregAnalysis_textExpiresAt_idx";
ALTER TABLE "InterregAnalysis" DROP COLUMN IF EXISTS "textExpiresAt";

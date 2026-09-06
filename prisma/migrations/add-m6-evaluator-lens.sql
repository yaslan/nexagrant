-- ============================================================================
-- M6 Evaluator Lens — panel evaluation data model (TASK-MTPZH6T9L6E2E)
--
-- Purpose
--   Adds the multi-reviewer panel shape on top of the existing v1.0 Evaluation
--   table: Reviewer (who scores), Criterion (weighted axes), Score (the marks).
--   Evaluation itself is EXTENDED, not rewritten — v1.0 rows written by
--   src/modules/m6/server/actions.ts (readerType HUMAN|AI) keep working.
--
-- Idempotency
--   Every statement is IF NOT EXISTS / DROP-then-CREATE / guarded by a catalog
--   lookup, so this file is safe to run any number of times. It never drops a
--   column, never rewrites a row, and adds no NOT NULL column without a DEFAULT.
--
-- Apply     psql "$DATABASE_URL" -f prisma/migrations/add-m6-evaluator-lens.sql
-- Roll back psql "$DATABASE_URL" -f prisma/migrations/add-m6-evaluator-lens.down.sql
-- After     pnpm db:rls   (RLS policies for the three new tables)
-- ============================================================================

BEGIN;

-- ─────────────────── 1. Evaluation: additive columns only ───────────────────
ALTER TABLE "Evaluation" ADD COLUMN IF NOT EXISTS "proposalId" TEXT;
ALTER TABLE "Evaluation" ADD COLUMN IF NOT EXISTS "status"     TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Evaluation" ADD COLUMN IF NOT EXISTS "avgScore"   DOUBLE PRECISION;
ALTER TABLE "Evaluation" ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Defaults so a PANEL row can omit the v1.0 single-reader scores.
-- Existing rows are untouched; this only changes what a future INSERT may omit.
ALTER TABLE "Evaluation" ALTER COLUMN "readerType"     SET DEFAULT 'HUMAN';
ALTER TABLE "Evaluation" ALTER COLUMN "excellence"     SET DEFAULT 0;
ALTER TABLE "Evaluation" ALTER COLUMN "impact"         SET DEFAULT 0;
ALTER TABLE "Evaluation" ALTER COLUMN "implementation" SET DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Evaluation_proposalId_fkey') THEN
    ALTER TABLE "Evaluation"
      ADD CONSTRAINT "Evaluation_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Evaluation_tenantId_proposalId_idx"    ON "Evaluation" ("tenantId", "proposalId");
CREATE INDEX IF NOT EXISTS "Evaluation_tenantId_opportunityId_idx" ON "Evaluation" ("tenantId", "opportunityId");

-- ─────────────────────────── 2. Reviewer ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Reviewer" (
  "id"           TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "evaluationId" TEXT         NOT NULL,
  "userId"       TEXT         NOT NULL,
  "role"         TEXT         NOT NULL DEFAULT 'evaluator',
  "status"       TEXT         NOT NULL DEFAULT 'pending',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reviewer_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reviewer_evaluationId_fkey') THEN
    ALTER TABLE "Reviewer" ADD CONSTRAINT "Reviewer_evaluationId_fkey"
      FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reviewer_userId_fkey') THEN
    ALTER TABLE "Reviewer" ADD CONSTRAINT "Reviewer_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reviewer_role_check') THEN
    ALTER TABLE "Reviewer" ADD CONSTRAINT "Reviewer_role_check"
      CHECK ("role" IN ('evaluator', 'coordinator'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reviewer_status_check') THEN
    ALTER TABLE "Reviewer" ADD CONSTRAINT "Reviewer_status_check"
      CHECK ("status" IN ('pending', 'completed'));
  END IF;
END $$;

-- One seat per user per evaluation: an evaluator cannot be assigned twice.
CREATE UNIQUE INDEX IF NOT EXISTS "Reviewer_evaluationId_userId_key" ON "Reviewer" ("evaluationId", "userId");
CREATE INDEX IF NOT EXISTS "Reviewer_evaluationId_status_idx"        ON "Reviewer" ("evaluationId", "status");
CREATE INDEX IF NOT EXISTS "Reviewer_tenantId_idx"                   ON "Reviewer" ("tenantId");

-- ─────────────────────────── 3. Criterion ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "Criterion" (
  "id"           TEXT             NOT NULL,
  "tenantId"     TEXT             NOT NULL,
  "evaluationId" TEXT             NOT NULL,
  "name"         TEXT             NOT NULL,
  "weight"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "order"        INTEGER          NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Criterion_evaluationId_fkey') THEN
    ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_evaluationId_fkey"
      FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Criterion_weight_check') THEN
    ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_weight_check"
      CHECK ("weight" >= 0 AND "weight" <= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Criterion_evaluationId_name_key" ON "Criterion" ("evaluationId", "name");
CREATE INDEX IF NOT EXISTS "Criterion_tenantId_evaluationId_idx"    ON "Criterion" ("tenantId", "evaluationId");

-- ───────────────────────────── 4. Score ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Score" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "reviewerId"  TEXT         NOT NULL,
  "criterionId" TEXT         NOT NULL,
  "score"       INTEGER      NOT NULL,
  "comment"     TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Score_reviewerId_fkey') THEN
    ALTER TABLE "Score" ADD CONSTRAINT "Score_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "Reviewer"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Score_criterionId_fkey') THEN
    ALTER TABLE "Score" ADD CONSTRAINT "Score_criterionId_fkey"
      FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  -- Prisma cannot express CHECK; this is the authoritative 1..5 guard.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Score_score_check') THEN
    ALTER TABLE "Score" ADD CONSTRAINT "Score_score_check"
      CHECK ("score" >= 1 AND "score" <= 5);
  END IF;
END $$;

-- A reviewer marks each criterion at most once.
CREATE UNIQUE INDEX IF NOT EXISTS "Score_reviewerId_criterionId_key" ON "Score" ("reviewerId", "criterionId");
CREATE INDEX IF NOT EXISTS "Score_criterionId_idx"                   ON "Score" ("criterionId");
CREATE INDEX IF NOT EXISTS "Score_tenantId_idx"                      ON "Score" ("tenantId");

-- ─────────────────────── 5. RLS for the new tables ──────────────────────────
-- Same policy shape as prisma/rls.sql. Repeated here so applying this file
-- alone leaves no tenant-scoped table unprotected.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Reviewer','Criterion','Score'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

COMMENT ON COLUMN "Evaluation"."proposalId" IS 'M6 v1.1 panel evaluation target. NULL for v1.0 HUMAN/AI opportunity-lens rows.';
COMMENT ON COLUMN "Evaluation"."status"     IS 'draft | in-progress | completed. Reaches completed when every Reviewer is completed.';
COMMENT ON COLUMN "Evaluation"."avgScore"   IS 'Weighted 1-5 panel average over Criterion.weight. NULL until at least one reviewer submits.';
COMMENT ON COLUMN "Score"."submittedAt"     IS 'NULL while the reviewer is drafting; set when the reviewer submits the panel form.';

COMMIT;

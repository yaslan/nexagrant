-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-review.sql — FO-186 / TASK-MVRIV9LCDHYKO (M17 Interreg pre-assessment, F1)
--
-- Purpose: storage for the M17 module (plan: docs/agent-results/FO-185-leed-fb.md).
--   • InterregAnalysis        — one call guide + one project file a user uploaded,
--                               as EXTRACTED TEXT only (the uploaded bytes are never
--                               stored); text kept 30 days per slot (owner decision; the
--                               per-slot expiry columns come from add-interreg-slot-retention.sql, FO-195).
--   • InterregAnalysisResult  — the F2 LLM output (internal pre-assessment, never an
--                               official score). Nothing writes it in F1.
--   • InterregCriterionMark   — one rubric criterion's mark (F2). Nothing writes it in F1.
-- These three are tenant-scoped: strict tenant_isolation in this file, in the wording
-- of prisma/rls.sql, so applying this file alone leaves no window without a policy.
--   • InterregRubric / InterregRubricCriterion — the assessment grid as DATA (FO-187:
--     Annex 7, 14 sub-criteria × 4 = 56, reject < 37). Platform reference tables, no
--     tenant: the platform_read block of prisma/rls.sql (readable by all, no write
--     through fabrika_app). Rows come from prisma/seed-interreg-rubrics.ts, not here.
--
-- Integrity (se-fb D1, crw2 Ö5): RLS checks a row's own tenantId, but a foreign key
-- check does not go through RLS, so a single-column FK would let a tenant file a mark
-- under another tenant's analysis id, or mark a criterion of another rubric. Composite
-- FKs close both in the database: result (analysisId, tenantId) → analysis (id,
-- tenantId); mark (analysisId, tenantId, rubricId) → analysis (id, tenantId, rubricId)
-- and mark (criterionId, rubricId) → criterion (id, rubricId). The mark carries a copy
-- of the analysis's rubricId for that. A database that ran the first version of this
-- file (single-column FKs, no mark.rubricId) is upgraded in place: column added and
-- backfilled from the analysis, old FKs dropped by name, new ones added.
--
-- Grants (se-fb D3): the rubric tables are SELECT-only for fabrika_app at the table
-- level too, not just by policy — rls-app-role.sql grants DML on all tables, so the
-- REVOKE is repeated there and in prisma/rls.sql.
--
-- Deletion: InterregAnalysis cascades from Tenant and from User (a user's erasure
-- removes their uploads); the two child tables cascade from InterregAnalysis. A rubric
-- or criterion still referenced by an analysis or a mark cannot be deleted (RESTRICT).
--
-- No CHECK constraints: a CHECK inside CREATE TABLE IF NOT EXISTS is lost on a
-- database whose table `prisma db push` built first (same note as add-blog-post.sql).
-- Mark ranges come from the rubric row and are enforced by the F2 writer (zod +
-- src/modules/m17/rubric.ts).
--
-- Idempotency: enums in DO … duplicate_object, tables/indexes IF NOT EXISTS, FKs
-- guarded by pg_constraint, policy DROP-then-CREATE. A second run, or a run after
-- `prisma db push`, changes nothing. Index and constraint names are Prisma's own.
-- Purely ADDITIVE: no existing table, column or row is touched.
-- Rollback: prisma/migrations/add-interreg-review.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "InterregAnalysisStatus" AS ENUM ('UPLOADING','EXTRACTING','CALL_READY','READY','ANALYZING','DONE','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "InterregDocFormat" AS ENUM ('PDF','DOCX','MD','TXT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "InterregRubric" (
  "id"                TEXT NOT NULL,
  "programme"         TEXT NOT NULL,
  "label"             TEXT NOT NULL,
  "isDefault"         BOOLEAN NOT NULL DEFAULT false,
  "allowedMarks"      JSONB NOT NULL,
  "maxRaw"            DECIMAL(6,1) NOT NULL,
  "passRaw"           DECIMAL(6,1),
  "budgetMinMinor"    INTEGER,
  "budgetMaxMinor"    INTEGER,
  "currency"          TEXT,
  "maxDurationMonths" INTEGER,
  "source"            JSONB NOT NULL,
  "tieBreak"          JSONB NOT NULL DEFAULT '[]',
  "programChecks"     JSONB NOT NULL DEFAULT '[]',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterregRubric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterregRubric_programme_idx" ON "InterregRubric"("programme");

CREATE TABLE IF NOT EXISTS "InterregRubricCriterion" (
  "id"                  TEXT NOT NULL,
  "rubricId"            TEXT NOT NULL,
  "criterionKey"        TEXT NOT NULL,
  "officialRef"         TEXT NOT NULL,
  "section"             TEXT NOT NULL,
  "group"               TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "position"            INTEGER NOT NULL,
  "maxMark"             DECIMAL(4,1) NOT NULL,
  "knockoutBelow"       DECIMAL(4,1),
  "subQuestions"        JSONB NOT NULL DEFAULT '[]',
  "afSections"          JSONB NOT NULL DEFAULT '[]',
  "evidenceExpectation" TEXT,
  CONSTRAINT "InterregRubricCriterion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterregRubricCriterion_rubricId_criterionKey_key" ON "InterregRubricCriterion"("rubricId", "criterionKey");
CREATE INDEX IF NOT EXISTS "InterregRubricCriterion_rubricId_position_idx" ON "InterregRubricCriterion"("rubricId", "position");

CREATE TABLE IF NOT EXISTS "InterregAnalysis" (
  "id"                 TEXT NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "rubricId"           TEXT NOT NULL,
  "status"             "InterregAnalysisStatus" NOT NULL DEFAULT 'UPLOADING',
  "callFileName"       TEXT,
  "callFormat"         "InterregDocFormat",
  "callPages"          INTEGER,
  "callChars"          INTEGER,
  "callText"           TEXT,
  "callExtractedAt"    TIMESTAMP(3),
  "projectFileName"    TEXT,
  "projectFormat"      "InterregDocFormat",
  "projectPages"       INTEGER,
  "projectChars"       INTEGER,
  "projectText"        TEXT,
  "projectExtractedAt" TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterregAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterregAnalysis_tenantId_userId_createdAt_idx" ON "InterregAnalysis"("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "InterregAnalysis_rubricId_idx" ON "InterregAnalysis"("rubricId");

CREATE TABLE IF NOT EXISTS "InterregAnalysisResult" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "analysisId"     TEXT NOT NULL,
  "rawScore"       DECIMAL(6,1) NOT NULL,
  "score100"       DECIMAL(4,1) NOT NULL,
  "passesThresholds" BOOLEAN NOT NULL,
  "knockouts"      JSONB NOT NULL DEFAULT '[]',
  "reportMarkdown" TEXT NOT NULL,
  "redFlags"       JSONB NOT NULL DEFAULT '[]',
  "improvements"   JSONB NOT NULL DEFAULT '[]',
  "rewriteSample"  JSONB NOT NULL DEFAULT '{}',
  "model"          TEXT NOT NULL,
  "promptHash"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterregAnalysisResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterregAnalysisResult_analysisId_key" ON "InterregAnalysisResult"("analysisId");
CREATE INDEX IF NOT EXISTS "InterregAnalysisResult_tenantId_idx" ON "InterregAnalysisResult"("tenantId");

CREATE TABLE IF NOT EXISTS "InterregCriterionMark" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "analysisId"      TEXT NOT NULL,
  "rubricId"        TEXT NOT NULL,
  "criterionId"     TEXT NOT NULL,
  "mark"            DECIMAL(4,1) NOT NULL,
  "strengths"       JSONB NOT NULL DEFAULT '[]',
  "weaknesses"      JSONB NOT NULL DEFAULT '[]',
  "evidenceQuote"   TEXT,
  "evidenceLocator" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterregCriterionMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterregCriterionMark_analysisId_criterionId_key" ON "InterregCriterionMark"("analysisId", "criterionId");
CREATE INDEX IF NOT EXISTS "InterregCriterionMark_tenantId_idx" ON "InterregCriterionMark"("tenantId");
CREATE INDEX IF NOT EXISTS "InterregCriterionMark_criterionId_idx" ON "InterregCriterionMark"("criterionId");

-- Upgrade of a database that ran the first version of this file: mark.rubricId.
ALTER TABLE "InterregCriterionMark" ADD COLUMN IF NOT EXISTS "rubricId" TEXT;
UPDATE "InterregCriterionMark" m SET "rubricId" = a."rubricId"
  FROM "InterregAnalysis" a WHERE a."id" = m."analysisId" AND m."rubricId" IS NULL;
ALTER TABLE "InterregCriterionMark" ALTER COLUMN "rubricId" SET NOT NULL;

-- Targets of the composite FKs (a FK needs a unique constraint on exactly its columns).
CREATE UNIQUE INDEX IF NOT EXISTS "InterregAnalysis_id_tenantId_key" ON "InterregAnalysis"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "InterregAnalysis_id_tenantId_rubricId_key" ON "InterregAnalysis"("id", "tenantId", "rubricId");
CREATE UNIQUE INDEX IF NOT EXISTS "InterregRubricCriterion_id_rubricId_key" ON "InterregRubricCriterion"("id", "rubricId");
CREATE UNIQUE INDEX IF NOT EXISTS "InterregAnalysisResult_analysisId_tenantId_key" ON "InterregAnalysisResult"("analysisId", "tenantId");

-- The single-column FKs of the first version, replaced by the composite ones below.
ALTER TABLE "InterregCriterionMark" DROP CONSTRAINT IF EXISTS "InterregCriterionMark_criterionId_fkey";
ALTER TABLE "InterregCriterionMark" DROP CONSTRAINT IF EXISTS "InterregCriterionMark_analysisId_fkey";
ALTER TABLE "InterregAnalysisResult" DROP CONSTRAINT IF EXISTS "InterregAnalysisResult_analysisId_fkey";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregRubricCriterion_rubricId_fkey') THEN
    ALTER TABLE "InterregRubricCriterion"
      ADD CONSTRAINT "InterregRubricCriterion_rubricId_fkey"
      FOREIGN KEY ("rubricId") REFERENCES "InterregRubric"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregAnalysis_rubricId_fkey') THEN
    ALTER TABLE "InterregAnalysis"
      ADD CONSTRAINT "InterregAnalysis_rubricId_fkey"
      FOREIGN KEY ("rubricId") REFERENCES "InterregRubric"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregCriterionMark_criterionId_rubricId_fkey') THEN
    ALTER TABLE "InterregCriterionMark"
      ADD CONSTRAINT "InterregCriterionMark_criterionId_rubricId_fkey"
      FOREIGN KEY ("criterionId", "rubricId") REFERENCES "InterregRubricCriterion"("id", "rubricId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregAnalysis_tenantId_fkey') THEN
    ALTER TABLE "InterregAnalysis"
      ADD CONSTRAINT "InterregAnalysis_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregAnalysis_userId_fkey') THEN
    ALTER TABLE "InterregAnalysis"
      ADD CONSTRAINT "InterregAnalysis_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregAnalysisResult_analysisId_tenantId_fkey') THEN
    ALTER TABLE "InterregAnalysisResult"
      ADD CONSTRAINT "InterregAnalysisResult_analysisId_tenantId_fkey"
      FOREIGN KEY ("analysisId", "tenantId") REFERENCES "InterregAnalysis"("id", "tenantId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterregCriterionMark_analysisId_tenantId_rubricId_fkey') THEN
    ALTER TABLE "InterregCriterionMark"
      ADD CONSTRAINT "InterregCriterionMark_analysisId_tenantId_rubricId_fkey"
      FOREIGN KEY ("analysisId", "tenantId", "rubricId") REFERENCES "InterregAnalysis"("id", "tenantId", "rubricId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant isolation, same wording as prisma/rls.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['InterregAnalysis','InterregAnalysisResult','InterregCriterionMark'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- Platform reference tables, same wording as the platform_read block of prisma/rls.sql:
-- readable by anyone, never writable through fabrika_app (the seed writes as owner).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['InterregRubric','InterregRubricCriterion'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_write ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_delete ON %I', t);
    EXECUTE format('CREATE POLICY platform_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY platform_no_insert ON %I FOR INSERT WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY platform_no_update ON %I FOR UPDATE USING (false)', t);
    EXECUTE format('CREATE POLICY platform_no_delete ON %I FOR DELETE USING (false)', t);
  END LOOP;
END $$;

-- Default privileges reach only roles that existed when rls-app-role.sql last
-- ran (same reasoning as add-notification.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "InterregAnalysis", "InterregAnalysisResult", "InterregCriterionMark"
    TO fabrika_app;
    GRANT SELECT ON "InterregRubric", "InterregRubricCriterion" TO fabrika_app;
    -- Default privileges may have granted DML when the tables were created (se-fb D3).
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "InterregRubric", "InterregRubricCriterion" FROM fabrika_app;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- add-project-idea-decision-log.sql — NG-38 / TASK-MW2SRMJT3TBWF (decisions K-577084, K-577269)
--
-- Purpose: the two spec §4 tables this card owns, nothing else (K-577269: "sırası gelen kart kadar").
--   • ProjectIdea — an institution's project idea: title, summary, keywords, TRL 1-9, target
--                   programmes, status. Tenant-scoped; no link to Opportunity yet.
--   • DecisionLog — apply/withdraw decisions: kind, reason (NOT NULL), decider, date. The one
--                   writer of WITHDRAW is src/lib/k5-pipeline/withdrawal.ts, which sets
--                   Opportunity.status = 'WITHDRAWN' in the same transaction. Until now nothing
--                   wrote that value (NG-22 F-7).
-- Both get strict tenant_isolation here, in the wording of prisma/rls.sql, so applying this file
-- alone leaves no window without a policy.
--
-- Integrity: RLS checks a row's own tenantId, a foreign key check does not go through RLS, so
-- DecisionLog points at Opportunity through (opportunityId, tenantId) → Opportunity (id, tenantId).
-- That unique index already exists (add-org-readiness-tables.sql); repeated IF NOT EXISTS here so
-- this file does not depend on the order it runs in.
--
-- Deletion: ProjectIdea cascades from Tenant; DecisionLog from its Opportunity, which cascades from
-- the tenant's workspace. A user's erasure nulls createdById / decidedById; the tenant's record stays.
--
-- No CHECK constraints: a CHECK inside CREATE TABLE IF NOT EXISTS is lost on a database whose table
-- `prisma db push` built first (add-blog-post.sql). TRL 1-9, a non-blank reason and text lengths are
-- the writers' (src/lib/project-ideas/records.ts, src/lib/k5-pipeline/withdrawal.ts).
--
-- Idempotency: enum types guarded by duplicate_object, tables/indexes IF NOT EXISTS, FKs guarded by
-- pg_constraint, policy DROP-then-CREATE. A second run, or a run after `prisma db push`, changes
-- nothing. Names are Prisma's own. Purely ADDITIVE: no existing column or row is touched.
-- Rollback: prisma/migrations/add-project-idea-decision-log.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ProjectIdeaStatus" AS ENUM ('OPEN', 'APPLIED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DecisionKind" AS ENUM ('APPLY', 'WITHDRAW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Opportunity_id_tenantId_key" ON "Opportunity"("id", "tenantId");

CREATE TABLE IF NOT EXISTS "ProjectIdea" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "summary"        TEXT,
  "keywords"       TEXT[],
  "trl"            INTEGER NOT NULL,
  "targetPrograms" TEXT[],
  "status"         "ProjectIdeaStatus" NOT NULL DEFAULT 'OPEN',
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectIdea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProjectIdea_tenantId_status_idx" ON "ProjectIdea"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ProjectIdea_createdById_idx" ON "ProjectIdea"("createdById");

CREATE TABLE IF NOT EXISTS "DecisionLog" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "kind"          "DecisionKind" NOT NULL,
  "reason"        TEXT NOT NULL,
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DecisionLog_opportunityId_tenantId_decidedAt_idx" ON "DecisionLog"("opportunityId", "tenantId", "decidedAt");
CREATE INDEX IF NOT EXISTS "DecisionLog_tenantId_idx" ON "DecisionLog"("tenantId");
CREATE INDEX IF NOT EXISTS "DecisionLog_decidedById_idx" ON "DecisionLog"("decidedById");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectIdea_tenantId_fkey') THEN
    ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectIdea_createdById_fkey') THEN
    ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DecisionLog_opportunityId_tenantId_fkey') THEN
    ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_opportunityId_tenantId_fkey"
      FOREIGN KEY ("opportunityId", "tenantId") REFERENCES "Opportunity"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DecisionLog_decidedById_fkey') THEN
    ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_decidedById_fkey"
      FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ProjectIdea','DecisionLog'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

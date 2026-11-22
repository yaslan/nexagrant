-- ─────────────────────────────────────────────────────────────────────────────
-- add-m18-client-pipeline.sql — NG-143 / M18-F1 (Client Pipeline / Müşteri Satış Hattı data layer)
--
-- Purpose: the M18 tables and the additive Call columns, nothing else.
--   • LeadOrganization, LeadContact, LeadMatch  — the consultancy's client organisations
--   • Deal (+ "DealStage"), DealActivity, DealTask — the sales pipeline (HibeLead deal_stage)
--   • ServicePackage, ServiceQuote, FunderRule   — fees, quotes, funder-side rules
--   • Call += eligibleApplicantTypes, eligibleRegions, cofinancingRateBp, complexity
--     (shared table, additive only; no second call table is opened — FO-265 §2)
-- DDL is Prisma's own (`prisma migrate diff` from origin/dev's schema), wrapped to be re-runnable.
--
-- RLS: all nine tables get strict tenant_isolation here, in the wording of prisma/rls.sql, so
-- applying this file alone leaves no window without a policy (scripts/rls-migrations.ts).
-- Integrity: a child names its parent as (parentId, tenantId) → (id, tenantId); a foreign-key
-- check does not go through RLS, so this is what stops a row pointing at another tenant's parent.
-- Money: Int minor units (cent) + currency (CLAUDE.md §9). No CHECK constraints: writers validate.
--
-- Idempotency: enum guarded by duplicate_object, tables/indexes/columns IF NOT EXISTS, FKs guarded
-- by pg_constraint, policy DROP-then-CREATE. A second run, or a run after `prisma db push`,
-- changes nothing. Purely ADDITIVE: no existing row is touched.
-- Rollback: prisma/migrations/add-m18-client-pipeline.down.sql (drops M18 rows; see that file).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "DealStage" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY_MEETING', 'ELIGIBILITY_ANALYSIS', 'PROPOSAL', 'CONTRACT', 'APPLICATION_PREP', 'SUBMITTED', 'WON', 'REJECTED', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Call: additive columns (shared, no tenantId) ──
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "eligibleApplicantTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "eligibleRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "cofinancingRateBp" INTEGER;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "complexity" TEXT;

CREATE TABLE IF NOT EXISTS "LeadOrganization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "orgType" TEXT,
    "provinceCode" TEXT,
    "district" TEXT,
    "nuts2" TEXT,
    "website" TEXT,
    "sectorCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeBand" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'LEAD',
    "disqualifyReason" TEXT,
    "ownerUserId" TEXT,
    "pic" TEXT,
    "cordisPic" TEXT,
    "partnerOrgId" TEXT,
    "dedupeKey" TEXT,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeadContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeadMatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "fitScore" INTEGER,
    "hardFail" BOOLEAN NOT NULL DEFAULT false,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "callId" TEXT,
    "servicePackageId" TEXT,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'NEW',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadScore" INTEGER,
    "scoreBreakdown" JSONB,
    "estimatedFeeCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "winProbability" INTEGER,
    "expectedCloseAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "ownerUserId" TEXT,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "autoRuleKey" TEXT,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServicePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL DEFAULT 'FIXED',
    "baseFeeCents" INTEGER NOT NULL,
    "successFeeBp" INTEGER,
    "successFeeCapCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "packageId" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FunderRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "funderName" TEXT NOT NULL,
    "programmeId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunderRule_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS "LeadOrganization_tenantId_name_idx" ON "LeadOrganization"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "LeadOrganization_tenantId_dedupeKey_idx" ON "LeadOrganization"("tenantId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "LeadOrganization_deletedAt_idx" ON "LeadOrganization"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadOrganization_id_tenantId_key" ON "LeadOrganization"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadOrganization_tenantId_sourceRef_key" ON "LeadOrganization"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "LeadContact_tenantId_organizationId_idx" ON "LeadContact"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "LeadContact_deletedAt_idx" ON "LeadContact"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadContact_id_tenantId_key" ON "LeadContact"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadContact_tenantId_sourceRef_key" ON "LeadContact"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "LeadMatch_callId_idx" ON "LeadMatch"("callId");
CREATE INDEX IF NOT EXISTS "LeadMatch_deletedAt_idx" ON "LeadMatch"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMatch_tenantId_organizationId_callId_key" ON "LeadMatch"("tenantId", "organizationId", "callId");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMatch_tenantId_sourceRef_key" ON "LeadMatch"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "Deal_tenantId_stage_idx" ON "Deal"("tenantId", "stage");
CREATE INDEX IF NOT EXISTS "Deal_tenantId_organizationId_idx" ON "Deal"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "Deal_callId_idx" ON "Deal"("callId");
CREATE INDEX IF NOT EXISTS "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_id_tenantId_key" ON "Deal"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_tenantId_sourceRef_key" ON "Deal"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "DealActivity_tenantId_dealId_occurredAt_idx" ON "DealActivity"("tenantId", "dealId", "occurredAt");
CREATE INDEX IF NOT EXISTS "DealActivity_deletedAt_idx" ON "DealActivity"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DealActivity_tenantId_sourceRef_key" ON "DealActivity"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "DealTask_tenantId_dealId_idx" ON "DealTask"("tenantId", "dealId");
CREATE INDEX IF NOT EXISTS "DealTask_tenantId_dueAt_idx" ON "DealTask"("tenantId", "dueAt");
CREATE INDEX IF NOT EXISTS "DealTask_deletedAt_idx" ON "DealTask"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DealTask_tenantId_sourceRef_key" ON "DealTask"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "ServicePackage_tenantId_active_idx" ON "ServicePackage"("tenantId", "active");
CREATE INDEX IF NOT EXISTS "ServicePackage_deletedAt_idx" ON "ServicePackage"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePackage_id_tenantId_key" ON "ServicePackage"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePackage_tenantId_sourceRef_key" ON "ServicePackage"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "ServiceQuote_deletedAt_idx" ON "ServiceQuote"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceQuote_tenantId_dealId_version_key" ON "ServiceQuote"("tenantId", "dealId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceQuote_tenantId_sourceRef_key" ON "ServiceQuote"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "FunderRule_tenantId_funderName_idx" ON "FunderRule"("tenantId", "funderName");
CREATE INDEX IF NOT EXISTS "FunderRule_programmeId_idx" ON "FunderRule"("programmeId");
CREATE INDEX IF NOT EXISTS "FunderRule_deletedAt_idx" ON "FunderRule"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "FunderRule_tenantId_sourceRef_key" ON "FunderRule"("tenantId", "sourceRef");

-- ── Foreign keys ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadOrganization_tenantId_fkey') THEN
    ALTER TABLE "LeadOrganization" ADD CONSTRAINT "LeadOrganization_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadContact_tenantId_fkey') THEN
    ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadContact_organizationId_tenantId_fkey') THEN
    ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_organizationId_tenantId_fkey"
      FOREIGN KEY ("organizationId", "tenantId") REFERENCES "LeadOrganization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadMatch_tenantId_fkey') THEN
    ALTER TABLE "LeadMatch" ADD CONSTRAINT "LeadMatch_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadMatch_organizationId_tenantId_fkey') THEN
    ALTER TABLE "LeadMatch" ADD CONSTRAINT "LeadMatch_organizationId_tenantId_fkey"
      FOREIGN KEY ("organizationId", "tenantId") REFERENCES "LeadOrganization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadMatch_callId_fkey') THEN
    ALTER TABLE "LeadMatch" ADD CONSTRAINT "LeadMatch_callId_fkey"
      FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_tenantId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_organizationId_tenantId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_tenantId_fkey"
      FOREIGN KEY ("organizationId", "tenantId") REFERENCES "LeadOrganization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_primaryContactId_tenantId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_primaryContactId_tenantId_fkey"
      FOREIGN KEY ("primaryContactId", "tenantId") REFERENCES "LeadContact"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_servicePackageId_tenantId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_servicePackageId_tenantId_fkey"
      FOREIGN KEY ("servicePackageId", "tenantId") REFERENCES "ServicePackage"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_callId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_callId_fkey"
      FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealActivity_tenantId_fkey') THEN
    ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealActivity_dealId_tenantId_fkey') THEN
    ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_tenantId_fkey"
      FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealTask_tenantId_fkey') THEN
    ALTER TABLE "DealTask" ADD CONSTRAINT "DealTask_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealTask_dealId_tenantId_fkey') THEN
    ALTER TABLE "DealTask" ADD CONSTRAINT "DealTask_dealId_tenantId_fkey"
      FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePackage_tenantId_fkey') THEN
    ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceQuote_tenantId_fkey') THEN
    ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceQuote_dealId_tenantId_fkey') THEN
    ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_dealId_tenantId_fkey"
      FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceQuote_packageId_tenantId_fkey') THEN
    ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_packageId_tenantId_fkey"
      FOREIGN KEY ("packageId", "tenantId") REFERENCES "ServicePackage"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FunderRule_tenantId_fkey') THEN
    ALTER TABLE "FunderRule" ADD CONSTRAINT "FunderRule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FunderRule_programmeId_fkey') THEN
    ALTER TABLE "FunderRule" ADD CONSTRAINT "FunderRule_programmeId_fkey"
      FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS (byte-identical to prisma/rls.sql) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['LeadOrganization','LeadContact','LeadMatch','Deal','DealActivity','DealTask','ServicePackage','ServiceQuote','FunderRule'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- add-m18-eligibility-report.sql — NG-136 / M18-F5 (AI eligibility pre-report)
--
-- Purpose: one new tenant table, "LeadEligibilityReport": the AI eligibility pre-report of a
-- client organisation (LeadOrganization) against a shared Call. It is an INTERNAL
-- pre-assessment ("iç ön değerlendirme"), not an official score; it stores Markdown text and a
-- DRAFT | APPROVED status, no numeric score. Only an APPROVED report may leave M18.
-- DDL is Prisma's own (`prisma migrate diff` from the previous schema), wrapped to be re-runnable.
--
-- RLS: strict tenant_isolation in the wording of prisma/rls.sql, in this same file, so applying it
-- alone leaves no window without a policy (scripts/rls-migrations.ts).
-- Integrity: (organizationId, tenantId) → LeadOrganization(id, tenantId): an FK check does not go
-- through RLS, so this is what stops a report pointing at another tenant's organisation.
--
-- Idempotency: table/indexes IF NOT EXISTS, FKs guarded by pg_constraint, policy DROP-then-CREATE.
-- A second run, or a run after `prisma db push`, changes nothing. Purely ADDITIVE: no existing
-- row or column is touched.
-- Rollback: prisma/migrations/add-m18-eligibility-report.down.sql (drops this table and its rows).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "LeadEligibilityReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "model" TEXT,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadEligibilityReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadEligibilityReport_tenantId_organizationId_createdAt_idx" ON "LeadEligibilityReport"("tenantId", "organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadEligibilityReport_callId_idx" ON "LeadEligibilityReport"("callId");
CREATE INDEX IF NOT EXISTS "LeadEligibilityReport_deletedAt_idx" ON "LeadEligibilityReport"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadEligibilityReport_id_tenantId_key" ON "LeadEligibilityReport"("id", "tenantId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadEligibilityReport_tenantId_fkey') THEN
    ALTER TABLE "LeadEligibilityReport" ADD CONSTRAINT "LeadEligibilityReport_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadEligibilityReport_organizationId_tenantId_fkey') THEN
    ALTER TABLE "LeadEligibilityReport" ADD CONSTRAINT "LeadEligibilityReport_organizationId_tenantId_fkey"
      FOREIGN KEY ("organizationId", "tenantId") REFERENCES "LeadOrganization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadEligibilityReport_callId_fkey') THEN
    ALTER TABLE "LeadEligibilityReport" ADD CONSTRAINT "LeadEligibilityReport_callId_fkey"
      FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS (byte-identical to prisma/rls.sql) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['LeadEligibilityReport'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

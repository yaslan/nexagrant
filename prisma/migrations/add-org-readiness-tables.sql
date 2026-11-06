-- ─────────────────────────────────────────────────────────────────────────────
-- add-org-readiness-tables.sql — NG-34 / TASK-MW2SR7LNPDI4M (decision K-577084)
--
-- Purpose: the three records G1 reads (spec §12, §17.1). No gate rule here (NG-33).
--   • OrgReadiness       — EU Login and LEAR answers of one organisation. No PIC column:
--                          PIC stays on Tenant.pic / ConsortiumSeat.organizationId /
--                          PartnerOrg.pic. A null answer is "not answered".
--   • InternalApproval   — internal sign-off, co-financing commitment, council decision;
--                          one per opportunity.
--   • PartnerBudgetShare — a partner's budget share range and its agreement; one per seat.
-- All three are tenant-scoped: strict tenant_isolation in this file, in the wording of
-- prisma/rls.sql, so applying this file alone leaves no window without a policy.
--
-- Integrity: RLS checks a row's own tenantId, but a foreign key check does not go through
-- RLS, so a single-column FK would let a tenant attach a row to another tenant's opportunity
-- or seat. Composite FKs close that: (opportunityId, tenantId) → Opportunity (id, tenantId),
-- (seatId, tenantId) → ConsortiumSeat (id, tenantId). Both parents get the unique index those
-- FKs need; ids are already unique, so building it cannot fail on existing rows. "One per
-- opportunity" and "one per seat" hold through the unique on the same pair: the FK ties an id
-- to its one tenant, so the pair cannot repeat an id.
--
-- Deletion: OrgReadiness cascades from Tenant; the other two from their parent, which
-- cascades from the tenant's workspace. A user's erasure nulls approvedById / agreedById.
--
-- No CHECK constraints: a CHECK inside CREATE TABLE IF NOT EXISTS is lost on a database whose
-- table `prisma db push` built first (add-blog-post.sql). min ≤ max is the writer's
-- (src/lib/gates/readiness-records.ts).
--
-- Idempotency: tables/indexes IF NOT EXISTS, FKs guarded by pg_constraint, policy
-- DROP-then-CREATE. A second run, or a run after `prisma db push`, changes nothing. Index and
-- constraint names are Prisma's own. Purely ADDITIVE: no existing column or row is touched.
-- Rollback: prisma/migrations/add-org-readiness-tables.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "Opportunity_id_tenantId_key" ON "Opportunity"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumSeat_id_tenantId_key" ON "ConsortiumSeat"("id", "tenantId");

CREATE TABLE IF NOT EXISTS "OrgReadiness" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "subject"      TEXT NOT NULL,
  "euLoginReady" BOOLEAN,
  "learReady"    BOOLEAN,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgReadiness_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgReadiness_tenantId_subject_key" ON "OrgReadiness"("tenantId", "subject");

CREATE TABLE IF NOT EXISTS "InternalApproval" (
  "id"                         TEXT NOT NULL,
  "tenantId"                   TEXT NOT NULL,
  "opportunityId"              TEXT NOT NULL,
  "approvedAt"                 TIMESTAMP(3),
  "approvedById"               TEXT,
  "cofinancingCommitmentCents" BIGINT,
  "currency"                   TEXT NOT NULL DEFAULT 'EUR',
  "councilDecisionRef"         TEXT,
  "councilDecisionAt"          TIMESTAMP(3),
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InternalApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InternalApproval_opportunityId_tenantId_key" ON "InternalApproval"("opportunityId", "tenantId");
CREATE INDEX IF NOT EXISTS "InternalApproval_tenantId_idx" ON "InternalApproval"("tenantId");
CREATE INDEX IF NOT EXISTS "InternalApproval_approvedById_idx" ON "InternalApproval"("approvedById");

CREATE TABLE IF NOT EXISTS "PartnerBudgetShare" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "seatId"     TEXT NOT NULL,
  "minCents"   BIGINT NOT NULL,
  "maxCents"   BIGINT NOT NULL,
  "currency"   TEXT NOT NULL DEFAULT 'EUR',
  "agreedAt"   TIMESTAMP(3),
  "agreedById" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerBudgetShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerBudgetShare_seatId_tenantId_key" ON "PartnerBudgetShare"("seatId", "tenantId");
CREATE INDEX IF NOT EXISTS "PartnerBudgetShare_tenantId_idx" ON "PartnerBudgetShare"("tenantId");
CREATE INDEX IF NOT EXISTS "PartnerBudgetShare_agreedById_idx" ON "PartnerBudgetShare"("agreedById");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgReadiness_tenantId_fkey') THEN
    ALTER TABLE "OrgReadiness" ADD CONSTRAINT "OrgReadiness_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InternalApproval_opportunityId_tenantId_fkey') THEN
    ALTER TABLE "InternalApproval" ADD CONSTRAINT "InternalApproval_opportunityId_tenantId_fkey"
      FOREIGN KEY ("opportunityId", "tenantId") REFERENCES "Opportunity"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InternalApproval_approvedById_fkey') THEN
    ALTER TABLE "InternalApproval" ADD CONSTRAINT "InternalApproval_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerBudgetShare_seatId_tenantId_fkey') THEN
    ALTER TABLE "PartnerBudgetShare" ADD CONSTRAINT "PartnerBudgetShare_seatId_tenantId_fkey"
      FOREIGN KEY ("seatId", "tenantId") REFERENCES "ConsortiumSeat"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerBudgetShare_agreedById_fkey') THEN
    ALTER TABLE "PartnerBudgetShare" ADD CONSTRAINT "PartnerBudgetShare_agreedById_fkey"
      FOREIGN KEY ("agreedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrgReadiness','InternalApproval','PartnerBudgetShare'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- TASK-MTRJ32BZBY2AI — plan versioning: PlanVersion, PlanFeature, PlanAssignment.
--
-- Step 1 of this task added the three models to prisma/schema.prisma and a
-- read layer on top of them, and `pnpm typecheck` stayed green — because
-- src/types/prisma-override.d.ts types every model delegate as `any`, so
-- `prisma.planVersion.findFirst(...)` type-checks whether or not the table
-- exists. It did not exist: measured on 2026-09-07, information_schema listed
-- Plan, ModuleCatalog, AuditEvent and Subscription but none of the three new
-- tables, and Plan had no `visibility` column. This file is the missing half.
--
-- Shape:
--   • Plan is the product (free/basic/pro/ultra) and keeps its current columns.
--   • PlanVersion is an immutable snapshot of what that product sells. Editing
--     a published version is forbidden in the repository layer; an edit clones
--     the row into a new draft. Immutability is what lets a Subscription point
--     at the exact terms it was sold under (Subscription.planVersionId).
--   • PlanFeature holds the card bullets of one version, ordered, in both
--     languages. A `module` bullet may only name a module the version actually
--     grants — enforced in src/lib/billing/plan-repository.ts, because the rule
--     is "the card cannot promise what the plan does not grant", not a column
--     constraint.
--   • PlanAssignment gives a private plan to one tenant. Tenant-scoped, so it
--     carries the same tenant_isolation policy as every other tenant table.
--
-- Backfill: every existing Plan gets version 1, published, copied from the Plan
-- row. Without it the admin screen and the read layer would show four plans
-- with no sellable version, and checkout would have nothing to record.
--
-- Additive and idempotent (IF NOT EXISTS throughout); re-running is a no-op.

ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public';

CREATE TABLE IF NOT EXISTS "PlanVersion" (
  "id"               TEXT PRIMARY KEY,
  "planId"           TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT,
  "version"          INTEGER NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'draft',
  "monthlyCents"     INTEGER NOT NULL,
  "yearlyCents"      INTEGER NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'USD',
  "seats"            INTEGER NOT NULL,
  "workspaces"       INTEGER NOT NULL,
  "aiCreditsMonthly" INTEGER NOT NULL,
  "modules"          TEXT[] NOT NULL DEFAULT '{}',
  "publishedBy"      TEXT,
  "publishedAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");

CREATE TABLE IF NOT EXISTS "PlanFeature" (
  "id"            TEXT PRIMARY KEY,
  "planVersionId" TEXT NOT NULL REFERENCES "PlanVersion"("id") ON DELETE CASCADE,
  "order"         INTEGER NOT NULL,
  "kind"          TEXT NOT NULL,
  "moduleId"      TEXT,
  "limitKey"      TEXT,
  "textTr"        TEXT,
  "textEn"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanFeature_planVersionId_order_idx" ON "PlanFeature"("planVersionId", "order");

CREATE TABLE IF NOT EXISTS "PlanAssignment" (
  "id"         TEXT PRIMARY KEY,
  "planId"     TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT,
  "tenantId"   TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "assignedBy" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanAssignment_planId_tenantId_key" ON "PlanAssignment"("planId", "tenantId");

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "planVersionId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_planVersionId_fkey'
  ) THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "Subscription_planVersionId_fkey"
      FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: version 1 of every plan, published, mirroring the Plan row.
INSERT INTO "PlanVersion" (
  "id","planId","version","status","monthlyCents","yearlyCents","currency",
  "seats","workspaces","aiCreditsMonthly","modules","publishedAt"
)
SELECT
  'pv_' || p."id" || '_1', p."id", 1, 'published', p."monthlyCents", p."yearlyCents",
  p."currency", p."seats", p."workspaces", p."aiCreditsMonthly", p."modules", CURRENT_TIMESTAMP
FROM "Plan" p
WHERE NOT EXISTS (SELECT 1 FROM "PlanVersion" v WHERE v."planId" = p."id");

-- Row level security. prisma/rls.sql is the source of truth and re-creates
-- these policies on every `pnpm db:rls`; they are stated here too so a database
-- built from migrations alone is never briefly readable across tenants.
--
-- PlanAssignment is tenant-scoped: which private plan a tenant has been given
-- is that tenant's business and nobody else's.
ALTER TABLE "PlanAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PlanAssignment";
CREATE POLICY tenant_isolation ON "PlanAssignment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Plan, PlanVersion and PlanFeature are platform tables: the catalogue is the
-- same for every tenant, so everyone reads it and no tenant connection writes
-- it. A policy names exactly one command, and an INSERT policy is expressed
-- with WITH CHECK rather than USING — hence three refusals rather than one.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Plan','PlanVersion','PlanFeature'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_delete ON %I', t);
    EXECUTE format('CREATE POLICY platform_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY platform_no_insert ON %I FOR INSERT WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY platform_no_update ON %I FOR UPDATE USING (false)', t);
    EXECUTE format('CREATE POLICY platform_no_delete ON %I FOR DELETE USING (false)', t);
  END LOOP;
END $$;

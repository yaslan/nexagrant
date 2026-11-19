-- ─────────────────────────────────────────────────────────────────────────────
-- add-nexagrant-plan-catalog.sql — NG-57 (NexaGrant plan catalogue, matrix, trial)
--
-- Purpose: five new tables, all additive:
--   "NgPlan", "NgPlanFeature", "NgPlanPrice", "NgTrialPolicy" — the NexaGrant plan catalogue
--     (plans, plan × feature matrix, TRY/EUR price cells, trial length per segment). Platform
--     reference data: rows come from prisma/seed.ts (prisma/seed-data/nexagrant-catalog.ts).
--   "NgSubscription" — a tenant's NexaGrant plan and trial (one row per tenant).
-- They are separate from Plan/Subscription on purpose (K-584182 = A): a NexaGrant plan id in
-- "Subscription" would reach getEntitlements, whose code catalogue throws on unknown ids.
-- DDL is Prisma's own (`prisma migrate diff` from the previous schema), wrapped to be re-runnable.
--
-- Integrity (CHECKs Prisma does not model, so `prisma db push` leaves them alone):
--   currency IN ('TRY','EUR') (K-584156 = A); interval IN ('year','month'); amountMinor NULL or > 0
--   (NULL = not priced yet, not purchasable); limitValue NULL or >= 0; days > 0;
--   at most one NgPlan with isFallback = true (partial unique index).
--
-- RLS: catalogue tables in the platform_read wording of prisma/rls.sql (readable by anyone,
-- never writable through fabrika_app; the seed writes as owner); "NgSubscription" in strict
-- tenant_isolation. Both in this same file, so applying it alone leaves no window without a
-- policy (scripts/rls-migrations.ts).
--
-- Idempotency: tables/indexes IF NOT EXISTS, FKs and CHECKs guarded by pg_constraint, policies
-- DROP-then-CREATE. A second run, or a run after `prisma db push`, changes nothing. No existing
-- row or column is touched.
-- Rollback: prisma/migrations/add-nexagrant-plan-catalog.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "NgPlan" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sellable" BOOLEAN NOT NULL DEFAULT false,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NgPlanFeature" (
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "limitValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgPlanFeature_pkey" PRIMARY KEY ("planId","featureKey")
);

CREATE TABLE IF NOT EXISTS "NgPlanPrice" (
    "planId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "amountMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgPlanPrice_pkey" PRIMARY KEY ("planId","currency","interval")
);

CREATE TABLE IF NOT EXISTS "NgTrialPolicy" (
    "segment" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "endPlanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgTrialPolicy_pkey" PRIMARY KEY ("segment")
);

CREATE TABLE IF NOT EXISTS "NgSubscription" (
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'TRIALING',
    "provider" TEXT NOT NULL DEFAULT 'ng-trial',
    "trialSegment" TEXT,
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "trialEndPlanId" TEXT,
    "trialEndedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NgSubscription_pkey" PRIMARY KEY ("tenantId")
);

CREATE INDEX IF NOT EXISTS "NgSubscription_status_trialEndsAt_idx" ON "NgSubscription"("status", "trialEndsAt");
-- At most one fallback plan: the plan of a tenant with no row is never ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "NgPlan_single_fallback_key" ON "NgPlan"("isFallback") WHERE "isFallback";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanFeature_planId_fkey') THEN
    ALTER TABLE "NgPlanFeature" ADD CONSTRAINT "NgPlanFeature_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "NgPlan"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanPrice_planId_fkey') THEN
    ALTER TABLE "NgPlanPrice" ADD CONSTRAINT "NgPlanPrice_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "NgPlan"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgTrialPolicy_planId_fkey') THEN
    ALTER TABLE "NgTrialPolicy" ADD CONSTRAINT "NgTrialPolicy_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "NgPlan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgTrialPolicy_endPlanId_fkey') THEN
    ALTER TABLE "NgTrialPolicy" ADD CONSTRAINT "NgTrialPolicy_endPlanId_fkey"
      FOREIGN KEY ("endPlanId") REFERENCES "NgPlan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgSubscription_tenantId_fkey') THEN
    ALTER TABLE "NgSubscription" ADD CONSTRAINT "NgSubscription_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgSubscription_planId_fkey') THEN
    ALTER TABLE "NgSubscription" ADD CONSTRAINT "NgSubscription_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "NgPlan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgSubscription_trialEndPlanId_fkey') THEN
    ALTER TABLE "NgSubscription" ADD CONSTRAINT "NgSubscription_trialEndPlanId_fkey"
      FOREIGN KEY ("trialEndPlanId") REFERENCES "NgPlan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanPrice_currency_check') THEN
    ALTER TABLE "NgPlanPrice" ADD CONSTRAINT "NgPlanPrice_currency_check" CHECK ("currency" IN ('TRY', 'EUR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanPrice_interval_check') THEN
    ALTER TABLE "NgPlanPrice" ADD CONSTRAINT "NgPlanPrice_interval_check" CHECK ("interval" IN ('year', 'month'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanPrice_amountMinor_check') THEN
    ALTER TABLE "NgPlanPrice" ADD CONSTRAINT "NgPlanPrice_amountMinor_check" CHECK ("amountMinor" IS NULL OR "amountMinor" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgPlanFeature_limitValue_check') THEN
    ALTER TABLE "NgPlanFeature" ADD CONSTRAINT "NgPlanFeature_limitValue_check" CHECK ("limitValue" IS NULL OR "limitValue" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgTrialPolicy_days_check') THEN
    ALTER TABLE "NgTrialPolicy" ADD CONSTRAINT "NgTrialPolicy_days_check" CHECK ("days" > 0);
  END IF;
END $$;

-- ── RLS (byte-identical to prisma/rls.sql) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['NgSubscription'] LOOP
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
  FOREACH t IN ARRAY ARRAY['NgPlan','NgPlanFeature','NgPlanPrice','NgTrialPolicy'] LOOP
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NgSubscription" TO fabrika_app;
    GRANT SELECT ON "NgPlan", "NgPlanFeature", "NgPlanPrice", "NgTrialPolicy" TO fabrika_app;
    -- Default privileges may have granted DML when the tables were created (se-fb D3).
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "NgPlan", "NgPlanFeature", "NgPlanPrice", "NgTrialPolicy" FROM fabrika_app;
  END IF;
END $$;

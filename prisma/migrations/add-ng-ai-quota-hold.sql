-- ─────────────────────────────────────────────────────────────────────────────
-- add-ng-ai-quota-hold.sql — NG-271 (NG-250 review O1 / probe P2)
--
-- Purpose: "NgAiQuotaHold" — one row per NexaGrant AI call in flight. The monthly AI allowance
-- (ai_writing_monthly) counted only the AiUsageLog rows, which generateCompletion writes after the
-- provider answers; the check's credit lock is released before the provider is called. N calls
-- started together all saw the same count (measured: N=12, limit 50, start 49 → 12 passed, 61 used).
-- assertNgAiQuota (src/lib/billing/nexagrant/usage.ts) now takes a hold under the lock and counts
-- AiUsageLog rows + unexpired holds; generateCompletion removes the hold in the transaction that
-- writes the usage row, or gives it back when the call delivers nothing. A hold left behind by a
-- dead process stops counting at "expiresAt" and is deleted by the next check of that tenant.
--
-- Additive: one new table, no existing row or column is touched. Rows live seconds; the table
-- holds at most one row per running call.
--
-- RLS: strict tenant_isolation, byte-identical to the prisma/rls.sql loop, in this same file so
-- applying it alone leaves no window without a policy (scripts/rls-migrations.ts).
--
-- Idempotency: table/index IF NOT EXISTS, FK guarded by pg_constraint, policy DROP-then-CREATE.
-- A second run, or a run after `prisma db push`, changes nothing.
-- Rollback: prisma/migrations/add-ng-ai-quota-hold.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "NgAiQuotaHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NgAiQuotaHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NgAiQuotaHold_tenantId_expiresAt_idx" ON "NgAiQuotaHold"("tenantId", "expiresAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgAiQuotaHold_tenantId_fkey') THEN
    ALTER TABLE "NgAiQuotaHold" ADD CONSTRAINT "NgAiQuotaHold_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- ── RLS (byte-identical to prisma/rls.sql) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['NgAiQuotaHold'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- Default privileges reach only roles that existed when rls-app-role.sql last
-- ran (same reasoning as add-notification.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NgAiQuotaHold" TO fabrika_app;
  END IF;
END $$;

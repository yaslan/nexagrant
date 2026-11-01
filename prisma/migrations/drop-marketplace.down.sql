-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for drop-marketplace.sql (TASK-MULSEGTKZ7O7D, ADR-0005).
--
-- Recreates the two tables empty, in the shape they had before the drop
-- (MarketplaceListing as the schema declared it, MarketplaceOrder as
-- add-marketplace-order.sql created it), with both RLS policies and the app
-- role's grants. The rows are not recoverable from here — restore those from
-- a backup. The code that used these tables is gone too; revert the task's
-- commits to bring it back, and put the two names back in prisma/rls.sql's
-- tenant_isolation array so `pnpm db:rls` keeps them.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS "MarketplaceListing" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price"       TEXT,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketplaceListing_tenantId_kind_idx" ON "MarketplaceListing" ("tenantId", "kind");

CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "listingId"         TEXT NOT NULL,
  "sellerTenantId"    TEXT NOT NULL,
  "totalAmountMinor"  INTEGER NOT NULL,
  "platformFeeMinor"  INTEGER NOT NULL,
  "payoutAmountMinor" INTEGER NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'EUR',
  "status"            TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceOrder_listingId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceOrder"
      ADD CONSTRAINT "MarketplaceOrder_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_tenantId_idx" ON "MarketplaceOrder" ("tenantId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_listingId_idx" ON "MarketplaceOrder" ("listingId");

-- Same wording as prisma/rls.sql, so the tables are never left without isolation.
ALTER TABLE "MarketplaceListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketplaceListing" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MarketplaceListing";
CREATE POLICY tenant_isolation ON "MarketplaceListing"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MarketplaceOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketplaceOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MarketplaceOrder";
CREATE POLICY tenant_isolation ON "MarketplaceOrder"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- system_scope: never the bare `app.system_scope = 'on'` test (TASK-MUPCYOCLINGC7,
-- crw2-fb B-1). That GUC is USERSET, so fabrika_app could set it itself and
-- read and write every tenant's rows until `pnpm db:rls` ran. Same wording as
-- auditevent-null-system-only.sql: rls.sql's sealed predicate once
-- system_scope_open() exists, otherwise only the table's owner gets through.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['MarketplaceListing', 'MarketplaceOrder'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS system_scope ON %I', t);
    IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
      EXECUTE format($p$CREATE POLICY system_scope ON %I
        USING ((SELECT public.system_scope_open(%L::regclass)))
        WITH CHECK ((SELECT public.system_scope_open(%L::regclass)))$p$,
        t, quote_ident(t), quote_ident(t));
    ELSE
      EXECUTE format($p$CREATE POLICY system_scope ON %I
        USING (current_setting('app.system_scope', true) = 'on'
               AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = %L::regclass), 'USAGE'))
        WITH CHECK (current_setting('app.system_scope', true) = 'on'
               AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = %L::regclass), 'USAGE'))$p$,
        t, quote_ident(t), quote_ident(t));
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "MarketplaceListing", "MarketplaceOrder" TO fabrika_app;
  END IF;
END $$;

COMMIT;

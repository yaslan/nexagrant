-- ─────────────────────────────────────────────────────────────────────────────
-- add-lifetime-licence.sql — TASK-MTR962OV5YGVX
--
-- Purpose: give the "first 20 companies" lifetime offer a record. Until now the
-- sale had nowhere to land — `checkout.session.completed` only did work when
-- `session.subscription` was set, so a one-time `lifetime-ultra` payment was
-- taken and then forgotten — and the pricing page made its scarcity counters up
-- ("5 licence owners", "next licence #6") in the message catalogue, against
-- CLAUDE.md rule 7. This table is what those counters now count.
--
-- Idempotency: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before
-- CREATE POLICY, CREATE OR REPLACE FUNCTION. Running the file twice is a no-op.
-- Purely ADDITIVE — nothing existing is dropped, renamed or retyped.
--
-- Rollback: prisma/migrations/add-lifetime-licence.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "LifetimeLicence" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "seq"               INTEGER NOT NULL,
  "sku"               TEXT NOT NULL DEFAULT 'lifetime-ultra',
  "amountMinor"       INTEGER NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "provider"          TEXT NOT NULL DEFAULT 'stripe',
  "providerEventId"   TEXT NOT NULL,
  "providerSessionId" TEXT,
  "purchasedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifetimeLicence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The three uniqueness rules that make a replayed webhook harmless:
--   seq               — two licences can never claim the same place in the run
--   providerEventId   — one Stripe event writes at most one licence
--   providerSessionId — the same checkout session, delivered under a new event
--                       id, still writes at most one licence
CREATE UNIQUE INDEX IF NOT EXISTS "LifetimeLicence_seq_key"               ON "LifetimeLicence" ("seq");
CREATE UNIQUE INDEX IF NOT EXISTS "LifetimeLicence_providerEventId_key"   ON "LifetimeLicence" ("providerEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "LifetimeLicence_providerSessionId_key" ON "LifetimeLicence" ("providerSessionId");
CREATE INDEX        IF NOT EXISTS "LifetimeLicence_tenantId_purchasedAt_idx" ON "LifetimeLicence" ("tenantId", "purchasedAt");

COMMENT ON TABLE  "LifetimeLicence"                     IS 'One-time lifetime licence sales. The pricing page scarcity counters are count() over this table — never a typed-in number.';
COMMENT ON COLUMN "LifetimeLicence"."seq"               IS 'Place in the limited run (1-based). The badge shows seq+1 as the next licence; the cap lives in src/lib/billing/catalog.ts (LIFETIME_LICENCE_CAP).';
COMMENT ON COLUMN "LifetimeLicence"."amountMinor"       IS 'What was actually charged, minor units. Not the catalogue list price — the campaign that was running is part of the record.';
COMMENT ON COLUMN "LifetimeLicence"."providerEventId"   IS 'Idempotency key: the Stripe event that created this row.';

-- Tenant isolation. Same shape as every other tenant-scoped table in
-- prisma/rls.sql, repeated here so applying this file alone leaves no window
-- where the table exists without a policy.
ALTER TABLE "LifetimeLicence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifetimeLicence" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LifetimeLicence";
CREATE POLICY tenant_isolation ON "LifetimeLicence"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- The public pricing page is not inside any tenant, so under the policy above it
-- would read zero rows and then honestly report "no owners yet" while twelve
-- licences existed — the same lie in the other direction. A SECURITY DEFINER
-- function is the narrow way out: it returns one integer and no row, so nothing
-- tenant-identifying escapes, and it answers the same number for the RLS-bound
-- `fabrika_app` role as for the owner.
-- Mirrored in prisma/rls.sql (which owns access control and is re-appliable);
-- both are CREATE OR REPLACE, so whichever runs last wins with the same body.
CREATE OR REPLACE FUNCTION public.lifetime_licence_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$ SELECT count(*)::int FROM "LifetimeLicence" $fn$;

COMMENT ON FUNCTION public.lifetime_licence_count() IS 'Cross-tenant count for the public scarcity badge. Returns a number only — never a row. See prisma/rls.sql.';

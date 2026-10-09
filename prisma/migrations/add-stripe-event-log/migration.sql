-- ─────────────────────────────────────────────────────────────────────────────
-- add-stripe-event-log — TASK-MTVSBEO7VX6Y4 · ADR-0003
--
-- Purpose: give the Stripe webhook an idempotency key that survives the switch
-- from the `fabrika` role (BYPASSRLS) to `fabrika_app` (NOBYPASSRLS).
--
-- The key used to be an `AuditEvent` row found by `data->>'stripeEventId'`.
-- `AuditEvent.tenantId` is nullable, so the table carries `tenant_or_shared`
-- rather than `tenant_isolation`, and a row that HAS a tenant is therefore both
-- unwritable and unreadable unless `app.tenant_id` is set to that tenant. The
-- row was written last — after the money, outside the tenant transaction — so
-- under `fabrika_app` the handler granted credits, failed to record the key, and
-- Stripe's redelivery re-ran the whole handler. Measured: a cancelled
-- subscription came back to ACTIVE and the monthly allowance was granted twice
-- (777 -> 1554 credits). See docs/adr/ADR-0003-stripe-webhook-idempotency-key.md.
--
-- Shape:
--   • `tenantId` NOT NULL      → plain `tenant_isolation`, lives inside withTenant.
--   • `stripeEventId` UNIQUE   → a second *concurrent* delivery of the same event
--                                 is refused by Postgres, not by a read-then-write
--                                 guard both deliveries pass. That race is the gap
--                                 the old guard's own docstring admitted to.
--   • `handler`                → which webhook wrote it, so a replay is attributable.
--
-- The backfill is not optional. With an empty table, every event Stripe is still
-- retrying (it retries for up to three days) would be processed once more. The
-- existing `AuditEvent` rows already record which events were handled, so they
-- are the source.
--
-- Additive and idempotent: every statement is IF NOT EXISTS / DROP-then-CREATE /
-- ON CONFLICT DO NOTHING, so a second run changes nothing.
-- Rollback: prisma/migrations/add-stripe-event-log/down.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. the table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StripeEventLog" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "handler"       TEXT NOT NULL,
    "processedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeEventLog_pkey" PRIMARY KEY ("id")
);

-- The constraint that does the actual work.
CREATE UNIQUE INDEX IF NOT EXISTS "StripeEventLog_stripeEventId_key"
    ON "StripeEventLog"("stripeEventId");

CREATE INDEX IF NOT EXISTS "StripeEventLog_tenantId_processedAt_idx"
    ON "StripeEventLog"("tenantId", "processedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StripeEventLog_tenantId_fkey') THEN
    ALTER TABLE "StripeEventLog"
      ADD CONSTRAINT "StripeEventLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 2. RLS — the whole point of this table ───────────────────────────────────
-- `tenantId` is NOT NULL here, so this is the strict policy, not the shared one.
-- FORCE, so the table owner (`fabrika`, which owns every table Prisma creates)
-- is not quietly exempt: without it the policy would only be evaluated for
-- non-owning roles and a future owner-connection would bypass it silently.
ALTER TABLE "StripeEventLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeEventLog" FORCE ROW LEVEL SECURITY;

-- Permissive policies OR together, so an obsolete one left behind outlives
-- every fix. Drop before create.
DROP POLICY IF EXISTS tenant_isolation ON "StripeEventLog";

CREATE POLICY tenant_isolation ON "StripeEventLog"
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- The RLS-subject application role needs DML here like on every other table.
-- `prisma/rls-app-role.sql` sets default privileges for future tables, but only
-- for the roles that existed when it last ran, so granting explicitly keeps this
-- migration correct on a database where that script has not been re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "StripeEventLog" TO fabrika_app;
  END IF;
END $$;

-- ── 3. backfill from the audit trail ─────────────────────────────────────────
-- One row per already-processed Stripe event. `DISTINCT ON` because the same
-- event id can legitimately appear on more than one audit row, and the UNIQUE
-- index would reject the second — the oldest audit row is the one that recorded
-- the processing.
--
-- `tenantId IS NOT NULL` filters out the tenant-less erasure rows: they carry no
-- Stripe event and cannot satisfy a NOT NULL column.
--
-- `gen_random_uuid()` rather than a cuid: Prisma's `@default(cuid())` is
-- client-side, so the column has no database default and the id only has to be
-- unique. Backfilled rows are distinguishable from application-written ones by
-- their id shape, which is a feature, not an accident.
INSERT INTO "StripeEventLog" ("id", "tenantId", "stripeEventId", "handler", "processedAt")
SELECT DISTINCT ON (a."data"->>'stripeEventId')
       gen_random_uuid()::text,
       a."tenantId",
       a."data"->>'stripeEventId',
       CASE a."type"
         WHEN 'subscription.updated'         THEN 'subscription.sync'
         WHEN 'subscription.canceled'        THEN 'subscription.cancel'
         WHEN 'invoice.payment_succeeded'    THEN 'invoice.payment'
         ELSE 'backfill:' || a."type"
       END,
       a."createdAt"
FROM "AuditEvent" a
WHERE a."data" ? 'stripeEventId'
  AND a."data"->>'stripeEventId' IS NOT NULL
  AND a."tenantId" IS NOT NULL
ORDER BY a."data"->>'stripeEventId', a."createdAt" ASC
ON CONFLICT ("stripeEventId") DO NOTHING;

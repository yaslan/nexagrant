-- Rollback for add-stripe-event-log (TASK-MTVSBEO7VX6Y4 · ADR-0003).
--
-- Read this before running it. Dropping the table gives the Stripe webhook back
-- an idempotency key that cannot be written or read under `fabrika_app`, which
-- is the defect this migration exists to close. Only run it while the
-- application still connects as a BYPASSRLS role, and revert
-- `src/lib/billing/subscription-sync.ts`, `prisma/rls.sql` and
-- `prisma/schema.prisma` in the same step — the code reads this table by name
-- and will throw without it.
--
-- The rows are not archived anywhere: the audit trail still carries every
-- `stripeEventId` in `AuditEvent.data`, which is where the backfill read them
-- from, so nothing is lost that cannot be rebuilt by re-running the migration.
--
-- Idempotent: safe to run twice.

DROP POLICY IF EXISTS tenant_isolation ON "StripeEventLog";
DROP TABLE IF EXISTS "StripeEventLog";

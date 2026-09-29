-- ─────────────────────────────────────────────────────────────────────────────
-- credit-ledger-grant-period.sql — TASK-MUMT3PGX5OK8P (ADR-0008 §6.2, İNCELEME-22 Kart 3 Ö-1)
--
-- Purpose: the scheduled monthly AI-credit grant (credits-monthly-grant job)
-- runs once per tenant per month, however often the job itself runs.
--
-- Why: the job wrote one new CreditLedger row per tenant on every run and the
-- table had no unique key, so a retry, a manual re-run, or the same tick running
-- in two schedulers during the Inngest → graphile-worker switch granted the
-- month's credits twice.
--
-- After this file:
--   * "grantPeriod" (TEXT, NULL) is 'YYYY-MM' on rows the job writes and NULL on
--     every other row (usage, purchase, refund, Stripe/iyzico grants).
--   * UNIQUE ("tenantId", "grantPeriod"): Postgres treats NULLs as distinct, so
--     rows without a period are not constrained at all. Not a partial index on
--     purpose: this repo syncs schema with `prisma db push` and Prisma cannot
--     express one (see add-soft-delete.sql). The same key is @@unique in
--     prisma/schema.prisma.
--   * The job inserts with ON CONFLICT DO NOTHING (createMany skipDuplicates),
--     so a second run for the same month adds nothing.
--   * No existing row is changed: old job rows keep "grantPeriod" NULL.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS and CREATE UNIQUE INDEX IF NOT EXISTS
-- with Prisma's own index name, so a database built by `db push` first gets no
-- second index.
--
-- Rollback: DROP INDEX IF EXISTS "CreditLedger_tenantId_grantPeriod_key";
--           ALTER TABLE "CreditLedger" DROP COLUMN IF EXISTS "grantPeriod";
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "CreditLedger" ADD COLUMN IF NOT EXISTS "grantPeriod" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedger_tenantId_grantPeriod_key"
  ON "CreditLedger" ("tenantId", "grantPeriod");

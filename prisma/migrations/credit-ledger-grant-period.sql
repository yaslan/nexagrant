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
--   * Backfill (İNCELEME-38 B-1): rows the old Inngest job wrote get their
--     month, so the key covers them too. Without it a month the old job had
--     already granted was granted again by the new job (NULL ≠ '2026-11').
--     Old job rows are `reason = 'monthly_grant' AND "refId" IS NULL`; the
--     iyzico / Stripe activation grants share the reason but always carry the
--     payment or subscription id, and are left alone. Only the first row per
--     tenant and UTC month is stamped (a retried old run may have written two;
--     the second stays NULL, it is history), and none when that month already
--     has a stamped row. The job also checks for such rows before it grants
--     (credits-monthly-grant.ts hasLegacyGrant), for one the old job writes
--     after this file ran.
--   * Not covered, by anything: the old job running AFTER the new one in the
--     same month. It cannot see the new row. That is why the deployment order
--     in ADR-0008 §9.2 applies to this job as well.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, a backfill that only touches NULL rows
-- of months without a stamped row, and CREATE UNIQUE INDEX IF NOT EXISTS with
-- Prisma's own index name, so a database built by `db push` first gets no
-- second index.
--
-- Rollback: DROP INDEX IF EXISTS "CreditLedger_tenantId_grantPeriod_key";
--           ALTER TABLE "CreditLedger" DROP COLUMN IF EXISTS "grantPeriod";
--   (the backfill goes with the column; no row's credits are changed by it)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "CreditLedger" ADD COLUMN IF NOT EXISTS "grantPeriod" TEXT;

UPDATE "CreditLedger" c
   SET "grantPeriod" = s.p
  FROM (SELECT id, "tenantId", to_char("createdAt", 'YYYY-MM') AS p,
               row_number() OVER (PARTITION BY "tenantId", to_char("createdAt", 'YYYY-MM')
                                  ORDER BY "createdAt", id) AS rn
          FROM "CreditLedger"
         WHERE reason = 'monthly_grant' AND "refId" IS NULL AND "grantPeriod" IS NULL) s
 WHERE c.id = s.id
   AND s.rn = 1
   AND NOT EXISTS (SELECT 1 FROM "CreditLedger" x
                    WHERE x."tenantId" = s."tenantId" AND x."grantPeriod" = s.p);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedger_tenantId_grantPeriod_key"
  ON "CreditLedger" ("tenantId", "grantPeriod");

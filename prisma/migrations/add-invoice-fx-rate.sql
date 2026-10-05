-- TASK-MTT13PK0Z4ZLB / ADR-0002 Faz 2 — carry the TCMB rate and the TL
-- equivalent on the invoice row itself.
--
-- ADR-0002 was decided on 2026-09-08 in favour of option (b): an invoice is
-- issued in its own currency (USD/EUR) and states, alongside it, the TCMB
-- *buying* rate of the issue date (VUK 280) and the Turkish lira equivalent
-- (VUK 215 / 385 Sıra No.lu Genel Tebliğ). Missing that, a domestic
-- foreign-currency invoice draws a second-degree irregularity penalty under
-- VUK 352 II-7.
--
-- Phase 1 (c029e1c) taught the *document* about a rate: `EfaturaDocument.
-- exchangeRate`, the UBL-TR `PricingExchangeRate`/`TaxExchangeRate` blocks and
-- `foreignCurrencyFilingBlock`, which refuses to file a foreign-currency
-- document that carries no rate. What it had nowhere to read that rate *from*
-- was this table: `Invoice` held only `currency`. This migration is that
-- storage.
--
-- Why on the row and not recomputed at export time: a rate is a fact about one
-- day. Re-fetching it when the document is reprinted would silently reprint a
-- different invoice than the one the customer holds, and CLAUDE.md rule 7 asks
-- every figure shown to a user to be tied to a stored record.
--
-- `fxRateDate` is the publication date of the rate actually used, which is not
-- always `issuedAt`: TCMB publishes nothing at weekends or on public holidays,
-- and the legally correct rate is then the most recent published one. Storing
-- the date makes that shift visible instead of implied.
--
-- The CHECK constraint is the point of the whole change. It makes "a
-- foreign-currency invoice without a rate" unrepresentable at the database
-- level, not merely discouraged in application code: uydurma kur yasak — the
-- rate comes from TCMB or no invoice is issued (ADR-0002, KARAR §4).
--
-- Additive: four nullable columns and one constraint; no existing column is
-- altered and no row is rewritten.
--
-- The constraint is added NOT VALID *deliberately*, not as a shortcut. Measured
-- on the local database before writing this:
--
--   SELECT count(*) FROM "Invoice";                        -- 2
--   SELECT count(*) FROM "Invoice" WHERE currency <> 'TRY'; -- 1
--                                                          -- ("qa-fx-…-USD",
--                                                          --  a QA fixture left
--                                                          --  by TASK-MTSWLWDONWA3W)
--
-- so a validating constraint would have failed to install here, and could fail
-- against any other environment holding a pre-decision foreign-currency row.
-- NOT VALID enforces the rule on every INSERT and UPDATE from now on while
-- leaving rows written before the rule existed where they are — a migration
-- does not get to decide that someone else's fiscal rows should disappear.
-- Those rows are not silently blessed either: `foreignCurrencyFilingBlock`
-- still refuses to file any of them, because they carry no rate.
--
-- Once an environment has no pre-decision foreign-currency rows left, the
-- constraint can be promoted in one statement, as a separate decision:
--
--   ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_fx_required_for_foreign_currency";
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout, and the constraint is
-- created only when pg_constraint does not already list it. Verified by running
-- it twice against the local database.
--
-- RLS: no change. `Invoice` is already in the tenant_isolation list in
-- prisma/rls.sql and policies are per-table, not per-column, so the new columns
-- inherit the existing isolation.
--
-- Down migration: add-invoice-fx-rate.down.sql (drops the constraint and the
-- four columns — destructive for the FX evidence on any issued invoice).

BEGIN;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fxRate"             DECIMAL(18,6);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fxRateDate"         DATE;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fxRateSource"       TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "grandTotalTryMinor" INTEGER;

-- A TRY invoice needs no conversion; anything else must carry all four facts.
-- `fxRate > 0` rejects a zero or negative rate, which would silently value the
-- whole document at nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_fx_required_for_foreign_currency'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_fx_required_for_foreign_currency"
      CHECK (
        "currency" = 'TRY'
        OR (
          "fxRate" IS NOT NULL
          AND "fxRate" > 0
          AND "fxRateDate" IS NOT NULL
          AND "fxRateSource" IS NOT NULL
          AND "grandTotalTryMinor" IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

COMMIT;

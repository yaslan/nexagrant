-- TASK-MTRD9QBJ2G32E — give invoice export a real record to read.
--
-- `GET /api/billing/invoices/[id]/export` served a Turkish e-Invoice built from
-- constants in the route file: a fixed ETTN, supplier VKN 3810459281, "Maslak
-- Vergi Dairesi", `isEfaturaUser: true`, and a footer stating the document was
-- sealed under VUK 213. It answered 200 to any caller with any id and no
-- session at all. There was no invoice table, so there was nothing truthful it
-- could have returned instead.
--
-- This table is that record. The buyer's fiscal identity is snapshotted on the
-- row rather than joined from Tenant: an invoice has to keep saying who it was
-- issued to after the tenant renames itself. Amounts live in `lines` as minor
-- units (CLAUDE.md rule 9); `issuedAt` is UTC (rule 10).
--
-- `gibEnvelopeId` is NULL until GİB actually accepts the filing through an
-- integrator. Nothing in the product files anything yet, so it is NULL on every
-- row today and the exporter says so on the document instead of claiming a seal.
--
-- RLS: added to the tenant_isolation list in prisma/rls.sql in the same change,
-- so a tenant cannot read another tenant's invoice even by guessing its number.
-- The same policy is stated at the foot of this file, so the table is never
-- briefly readable across tenants between this migration and `pnpm db:rls`
-- (TASK-MTVDSSJTZCY4T).
--
-- Down migration: add-invoice.down.sql (drops the table — destructive).

BEGIN;

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "number"         TEXT NOT NULL,
  "issuedAt"       TIMESTAMP(3) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'TRY',
  "buyerName"      TEXT NOT NULL,
  "buyerVknTckn"   TEXT NOT NULL,
  "buyerTaxOffice" TEXT NOT NULL,
  "buyerAddress"   TEXT NOT NULL,
  "buyerCity"      TEXT NOT NULL,
  "buyerCountry"   TEXT NOT NULL DEFAULT 'Türkiye',
  "lines"          JSONB NOT NULL,
  "profileId"      TEXT NOT NULL DEFAULT 'TICARIFATURA',
  "invoiceType"    TEXT NOT NULL DEFAULT 'SATIS',
  "ettn"           TEXT NOT NULL,
  "gibEnvelopeId"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_ettn_key" ON "Invoice" ("ettn");
-- The number a customer cites is unique inside their own tenant, not globally:
-- two tenants may legitimately be handed the same series by different issuers.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_number_key" ON "Invoice" ("tenantId", "number");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_issuedAt_idx" ON "Invoice" ("tenantId", "issuedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_tenantId_fkey'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Row level security, stated here as well as in prisma/rls.sql. prisma/rls.sql
-- stays the source of truth and re-creates this on every `pnpm db:rls`; it is
-- repeated here so applying this file alone leaves no window where the table
-- exists without a policy. That window is the release procedure, not a
-- hypothesis: docs/RELEASE_CHECKLIST.md §1 has a human apply these flat .sql
-- files by hand before the code ships, and `pnpm db:rls` is a separate step
-- (TASK-MTVDSSJTZCY4T). Wording is byte-identical to prisma/rls.sql:19-21.
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invoice";
CREATE POLICY tenant_isolation ON "Invoice"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

COMMIT;

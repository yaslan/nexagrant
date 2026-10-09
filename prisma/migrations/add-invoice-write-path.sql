-- TASK-MTSWL8ADKZKDM — let a successful payment actually issue an invoice.
--
-- `Invoice` existed (add-invoice.sql), the exporter existed, the UBL-TR
-- generator existed — and no production code ever wrote a row. Every paid
-- customer had zero invoices and `/api/billing/invoices/<id>/export` answered
-- 404 for all of them. Two things were missing before a row could be written
-- honestly:
--
-- 1. `TenantBillingIdentity` — somewhere to keep the buyer's fiscal identity.
--    Nothing in the schema held a tenant's VKN/TCKN, tax office or billing
--    address: `Tenant` has a display name and an ISO country code, and the
--    billing panel read the buyer identity back off the *newest invoice*, which
--    is circular — it can only show what some earlier invoice already claimed.
--    Without this table the only way to fill `Invoice.buyer*` would have been to
--    invent it, which is exactly what TASK-MTRD9QBJ2G32E removed from this repo.
--    A tenant with no row here gets no invoice and a SystemAlert naming the
--    fields, rather than an invoice naming a taxpayer who does not exist.
--
--    The row is the tenant's *current* identity and is mutable; `Invoice.buyer*`
--    stays the frozen snapshot taken at issue time, so correcting a typo here
--    never rewrites a document already handed to a customer.
--
-- 2. `Invoice.paymentRef` — the provider payment this invoice was issued for,
--    with a unique index per tenant, so a redelivered webhook cannot issue a
--    second invoice for one payment. Idempotency for a fiscal document belongs
--    on the row and not only in the caller's guard: the Stripe path's own guard
--    (`subscription-sync.ts`, `data: { equals: { stripeEventId } }`) compares the
--    whole JSON object and so never matches — reported, not fixed, by this card.
--
--    Nullable, because every row written before this migration was issued
--    without one. Postgres treats NULLs as distinct in a unique index, so those
--    rows neither collide with each other nor block this constraint.
--
-- Idempotent: re-running creates nothing twice (IF NOT EXISTS throughout, and
-- the FK/column guards check the catalogue first). Verified by running it twice.
--
-- RLS: `TenantBillingIdentity` is added to the tenant_isolation list in
-- prisma/rls.sql in this same change. Its `tenantId` is the primary key, which
-- the existing policy expression matches unchanged, exactly as `TenantProfile`
-- already does. The same policy is stated at the foot of this file, so the
-- VKN/TCKN and billing address it holds are never briefly readable across
-- tenants between this migration and `pnpm db:rls` (TASK-MTVDSSJTZCY4T).
--
-- Down migration: add-invoice-write-path.down.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS "TenantBillingIdentity" (
  "tenantId"       TEXT NOT NULL,
  "buyerName"      TEXT NOT NULL,
  "buyerVknTckn"   TEXT NOT NULL,
  "buyerTaxOffice" TEXT NOT NULL,
  "buyerAddress"   TEXT NOT NULL,
  "buyerCity"      TEXT NOT NULL,
  "buyerCountry"   TEXT NOT NULL DEFAULT 'Türkiye',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantBillingIdentity_pkey" PRIMARY KEY ("tenantId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantBillingIdentity_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantBillingIdentity"
      ADD CONSTRAINT "TenantBillingIdentity_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;

-- One invoice per payment, per tenant. Scoped to the tenant rather than global
-- because a payment id is only unique within one provider's account.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_paymentRef_key"
  ON "Invoice" ("tenantId", "paymentRef");

-- Row level security, stated here as well as in prisma/rls.sql. prisma/rls.sql
-- stays the source of truth and re-creates this on every `pnpm db:rls`; it is
-- repeated here so applying this file alone leaves no window where the table
-- exists without a policy. That window is the release procedure, not a
-- hypothesis: docs/RELEASE_CHECKLIST.md §1 has a human apply these flat .sql
-- files by hand before the code ships, and `pnpm db:rls` is a separate step
-- (TASK-MTVDSSJTZCY4T). Wording is byte-identical to prisma/rls.sql:19-21.
ALTER TABLE "TenantBillingIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantBillingIdentity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantBillingIdentity";
CREATE POLICY tenant_isolation ON "TenantBillingIdentity"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- add-public-lead-route-consistency.sql — NG-174 (SEC NG-170 D-2)
--
-- Purpose: the routing outcome columns on "PublicLead" (add-province-lead-route.sql) were three
-- independent nullable columns; the database accepted `routeStatus='routed'` with a NULL
-- "routedTenantId" and a free-text "routeReason". This adds ONE check that ties them together:
--
--   * nothing recorded            : routeStatus, routeReason, routedTenantId all NULL
--   * routed                      : routedTenantId NOT NULL, routeReason NULL
--   * unmatched                   : routeReason IN (UnmatchedReason), routedTenantId NULL
--
-- UnmatchedReason = src/core/contracts/lead-routing.ts (province_missing, province_unmapped,
-- tenant_refused, consent_recipient_mismatch (NG-204)); a new reason there needs this list extended in
-- the same PR.
--
-- "routedTenantId" is deliberately NOT a foreign key: when a tenant is deleted the lead keeps
-- pointing at it (audit trail of who received it) and forwardPublicLead never moves it elsewhere
-- (a routed lead is handed to at most one tenant, NG-174).
--
-- NULL trap: a CHECK lets NULL (unknown) through, and `NULL = 'routed'` / `NULL IN (...)` are NULL, so
-- every branch states its NOT NULL columns explicitly ("routeStatus", "routeReason" for 'unmatched');
-- tests/province-lead-route.live.test.ts pins the rows that slipped through the first draft.
--
-- Existing data: if any row already violates the check the migration STOPS and lists the count
-- (no silent rewrite of a lead's routing history). Fix those rows by hand, then re-run.
--
-- Additive + idempotent: the constraint is dropped and re-added by name; no row is touched.
-- Rollback: prisma/migrations/add-public-lead-route-consistency.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "PublicLead" WHERE NOT (
       ("routeStatus" IS NULL AND "routeReason" IS NULL AND "routedTenantId" IS NULL)
    OR ("routeStatus" IS NOT NULL AND "routeStatus" = 'routed' AND "routedTenantId" IS NOT NULL AND "routeReason" IS NULL)
    OR ("routeStatus" IS NOT NULL AND "routeStatus" = 'unmatched' AND "routedTenantId" IS NULL
        AND "routeReason" IS NOT NULL AND "routeReason" IN ('province_missing', 'province_unmapped', 'tenant_refused', 'consent_recipient_mismatch'))
  );
  IF bad > 0 THEN
    RAISE EXCEPTION 'add-public-lead-route-consistency: % PublicLead row(s) violate the route consistency rule; fix them by hand first (SELECT id, "routeStatus", "routeReason", "routedTenantId" FROM "PublicLead" ...)', bad;
  END IF;
END $$;

ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_route_consistency_check";
ALTER TABLE "PublicLead" ADD CONSTRAINT "PublicLead_route_consistency_check" CHECK (
     ("routeStatus" IS NULL AND "routeReason" IS NULL AND "routedTenantId" IS NULL)
  OR ("routeStatus" IS NOT NULL AND "routeStatus" = 'routed' AND "routedTenantId" IS NOT NULL AND "routeReason" IS NULL)
  OR ("routeStatus" IS NOT NULL AND "routeStatus" = 'unmatched' AND "routedTenantId" IS NULL
      AND "routeReason" IS NOT NULL AND "routeReason" IN ('province_missing', 'province_unmapped', 'tenant_refused', 'consent_recipient_mismatch'))
);

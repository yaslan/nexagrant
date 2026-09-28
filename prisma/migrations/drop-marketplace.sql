-- ─────────────────────────────────────────────────────────────────────────────
-- drop-marketplace.sql — TASK-MULSEGTKZ7O7D (ADR-0005)
--
-- Owner decision 2026-09-29: no marketplace and no sales between institutions.
-- The listing and order tables go with the code that wrote them
-- (src/modules/marketplace, removed in the same task). Subscriptions, plans,
-- add-ons and billing are untouched.
--
-- DESTRUCTIVE: every listing and every recorded order is dropped. Count both
-- tables first and stop if any database this runs against holds a row that is
-- not seed or demo data:
--   SELECT count(*) FROM "MarketplaceListing";
--   SELECT count(*) FROM "MarketplaceOrder";
-- Count as a role with BYPASSRLS (or superuser): both tables FORCE row level
-- security, so the app role sees only its own tenant's rows and reads 0.
--
-- Order matters: MarketplaceOrder has a RESTRICT foreign key to
-- MarketplaceListing, so the orders go first. Dropping a table drops its
-- policies (tenant_isolation, system_scope) and indexes with it.
--
-- The earlier add-marketplace-order.sql stays in the folder as history.
-- Rollback: prisma/migrations/drop-marketplace.down.sql
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP TABLE IF EXISTS "MarketplaceOrder";
DROP TABLE IF EXISTS "MarketplaceListing";

COMMIT;

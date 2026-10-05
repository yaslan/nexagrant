-- ─────────────────────────────────────────────────────────────────────────────
-- drop-marketplace.sql — TASK-MULSEGTKZ7O7D (ADR-0005)
--
-- Owner decision 2026-09-29: no marketplace and no sales between institutions.
-- The listing and order tables go with the code that wrote them
-- (src/modules/marketplace, removed in the same task). Subscriptions, plans,
-- add-ons and billing are untouched.
--
-- DESTRUCTIVE: every listing and every recorded order is dropped. The DO block
-- below counts both tables and raises instead of dropping when either holds a
-- row (TASK-MULU88PPI3HY3, review K-11). After checking the rows are seed or
-- demo data, or backed up, allow the drop for that one session:
--   PGOPTIONS='-c app.allow_marketplace_drop=on' psql "$URL" -f drop-marketplace.sql
-- The count sees every tenant's rows: both tables FORCE row level security, so
-- the block turns FORCE off first (it needs ownership, as the DROP does) and a
-- raise rolls that back with the rest of the transaction.
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

-- A table that is already gone is skipped, so a second run still exits 0.
DO $$
DECLARE
  t text;
  n bigint;
  nonempty text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['MarketplaceOrder', 'MarketplaceListing'] LOOP
    IF to_regclass(format('%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      IF n > 0 THEN
        nonempty := nonempty || format(' %s=%s', t, n);
      END IF;
    END IF;
  END LOOP;

  IF nonempty <> '' AND current_setting('app.allow_marketplace_drop', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'drop-marketplace: refusing to drop tables that hold rows:%', nonempty
      USING HINT = 'Back the rows up, then rerun with PGOPTIONS=''-c app.allow_marketplace_drop=on''.';
  END IF;
END
$$;

DROP TABLE IF EXISTS "MarketplaceOrder";
DROP TABLE IF EXISTS "MarketplaceListing";

COMMIT;

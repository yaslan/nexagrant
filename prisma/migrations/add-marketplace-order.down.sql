-- Rollback for add-marketplace-order.sql (TASK-MTVUQXSYL0X2H).
--
-- DESTRUCTIVE: dropping this table discards every recorded marketplace order
-- and the commission split that was charged on each. Export it first if any
-- database this runs against has served a real order:
--   \copy (SELECT * FROM "MarketplaceOrder") TO 'marketplace-orders-backup.csv' CSV HEADER

DROP POLICY IF EXISTS tenant_isolation ON "MarketplaceOrder";
DROP TABLE IF EXISTS "MarketplaceOrder";

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-notification.down.sql — rollback for add-notification.sql
--
-- DESTRUCTIVE: drops the Notification table and every notification in it.
-- Revert prisma/schema.prisma, prisma/rls.sql, src/lib/notifications/,
-- src/actions/user/notifications.ts, the alerts-daily hook and the
-- notifications-retention job in the same step: they read the table by name.
-- Nothing is archived: the rows are derived (saved-search matches can be
-- recounted) and expire after 90 days anyway. Export first if needed:
--   \copy (SELECT * FROM "Notification") TO 'notification-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON "Notification";
DROP TABLE IF EXISTS "Notification";
DROP TYPE IF EXISTS "NotificationType";

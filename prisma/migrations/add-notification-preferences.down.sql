-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-notification-preferences.down.sql — rollback for add-notification-preferences.sql (NG-43)
--
-- DESTRUCTIVE: drops NotificationPreference and NotificationEmailItem with their rows, and the three
-- enum types. Users fall back to the code default (panel INSTANT, e-mail OFF); e-mails still in the
-- outbox are not sent. No other table loses a row. Revert prisma/schema.prisma, prisma/rls.sql and
-- apply-order.txt in the same step. Export first if it matters:
--   \copy (SELECT * FROM "NotificationPreference") TO 'notification-preference-backup.csv' CSV HEADER
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "NotificationEmailItem";
DROP TABLE IF EXISTS "NotificationPreference";
DROP TYPE IF EXISTS "NotificationFrequency";
DROP TYPE IF EXISTS "NotificationChannel";
DROP TYPE IF EXISTS "NotificationEvent";

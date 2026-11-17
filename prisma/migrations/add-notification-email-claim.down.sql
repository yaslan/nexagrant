-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- add-notification-email-claim.down.sql — rollback for add-notification-email-claim.sql (NG-131)
-- Drops the two claim columns (only in-flight claims are lost; no mail record, sentAt stays).
-- Revert prisma/schema.prisma and apply-order.txt in the same step. Idempotent (IF EXISTS).
ALTER TABLE "NotificationEmailItem" DROP COLUMN IF EXISTS "claimToken";
ALTER TABLE "NotificationEmailItem" DROP COLUMN IF EXISTS "claimedAt";

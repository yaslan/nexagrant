-- devop-fb: 07 (rename-feedback-alert-columns) arşiv yolunu koşturan fikstür.
-- İki kiracı, Feedback'in sentry kolonlu ESKİ şekli; C negatif kontrol ('recorded').
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES
  ('dt-a','dt-a','dt-a','TR',now()), ('dt-b','dt-b','dt-b','TR',now()), ('dt-c','dt-c','dt-c','TR',now());
INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertId","alertStatus","updatedAt") VALUES
  ('df-a1','dt-a','BUG','t','b','sentry-a1','sent',now()), ('df-a2','dt-a','BUG','t','b',NULL,'skipped',now()),
  ('df-b1','dt-b','BUG','t','b','sentry-b1','failed',now()), ('df-c1','dt-c','BUG','t','b',NULL,'recorded',now());
ALTER TABLE "Feedback" RENAME COLUMN "alertId" TO "sentryEventId";
ALTER TABLE "Feedback" RENAME COLUMN "alertStatus" TO "sentryStatus";
COMMIT;

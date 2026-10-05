-- Ö-4 fikstürü: db push yapılmış, db:rls HİÇ koşmamış, veri dolu DB; Feedback eski (sentry) şeklinde.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('gt-a','gt-a','gt-a','TR',now()), ('gt-b','gt-b','gt-b','TR',now());
INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertId","alertStatus","updatedAt") VALUES
  ('gf1','gt-a','BUG','t','b','sentry-g1','sent',now()), ('gf2','gt-b','BUG','t','b','sentry-g2','failed',now());
ALTER TABLE "Feedback" RENAME COLUMN "alertId" TO "sentryEventId";
ALTER TABLE "Feedback" RENAME COLUMN "alertStatus" TO "sentryStatus";
COMMIT;

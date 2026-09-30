-- TASK-MUOEGWSV8I7H0: pre-migration ("legacy") rows that make every FORCE-RLS
-- backfill in the chain do work. Run as superuser on a fully migrated DB
-- (the files are idempotent, so re-running the chain on this state exercises
-- exactly their backfill statements). Two tenants, fixture data only.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES
  ('lt-a','lt-a','lt-a','TR',now()), ('lt-b','lt-b','lt-b','TR',now());
INSERT INTO "User"(id,email,"updatedAt") VALUES
  ('lu-a','lu-a@example.test',now()), ('lu-b','lu-b@example.test',now());
INSERT INTO "Membership"(id,"tenantId","userId") VALUES ('lm-a','lt-a','lu-a'), ('lm-b','lt-b','lu-b');
INSERT INTO "Workspace"(id,"tenantId",name,slug) VALUES ('lw-a','lt-a','w','default'), ('lw-b','lt-b','w','default');

-- 7 rename-feedback-alert-columns: UPDATE "Feedback" ... WHERE alertStatus IN (sent,skipped,failed)
INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertStatus","updatedAt") VALUES
  ('lf-a','lt-a','BUG','t','b','sent',now()), ('lf-b','lt-b','BUG','t','b','failed',now());

-- 8 retire-eur-plan-ladder: a subscription still on a retired plan id
INSERT INTO "Plan"(id,name,"monthlyCents","yearlyCents",seats,workspaces,"aiCreditsMonthly")
  VALUES ('team','Team',1,1,10,3,1) ON CONFLICT (id) DO NOTHING;
INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES
  ('lt-a','team','ACTIVE',now()), ('lt-b','team','ACTIVE',now());

-- 14 topicmatch-per-opportunity: K1 rows with a G0 score and no opportunity
INSERT INTO "Programme"(id,name,"sourceKey") SELECT 'lp','LP','lp' WHERE NOT EXISTS (SELECT 1 FROM "Programme" WHERE id='lp');
INSERT INTO "Call"(id,"programmeId","callIdentifier",title) VALUES ('lc','lp','LC','LC');
INSERT INTO "Topic"(id,"callId",identifier,title,deadlines,"updatedAt") VALUES
  ('ltp-1','lc','LT-1','t1','[]',now()), ('ltp-2','lc','LT-2','t2','[]',now());
INSERT INTO "Opportunity"(id,"tenantId","workspaceId","topicId",title,"updatedAt") VALUES
  ('lo-a1','lt-a','lw-a','ltp-1','o',now()), ('lo-a2','lt-a','lw-a','ltp-2','o',now());
INSERT INTO "TopicMatch"(id,"tenantId","topicId","fitScore","g0Score",breakdown) VALUES
  ('ltm-1','lt-a','ltp-1',0.5,44.9,'{"scoringVersion":1}'),
  ('ltm-2','lt-a','ltp-2',0.5,40,'{"scoringVersion":1,"g0ScorerPlaceholderFitScore":"true"}');

-- 21 add-stripe-event-log: processed Stripe events known only from the audit trail
INSERT INTO "AuditEvent"(id,"tenantId",type,data) VALUES
  ('la-1','lt-a','subscription.updated','{"stripeEventId":"evt_legacy_1"}'),
  ('la-2','lt-b','invoice.payment_succeeded','{"stripeEventId":"evt_legacy_2"}');

-- 32 hash-bearer-tokens: raw bearer tokens from before hashing
ALTER TABLE "Invitation" ADD COLUMN "token" TEXT;
ALTER TABLE "Invitation" ALTER COLUMN "tokenHash" DROP NOT NULL;
INSERT INTO "Invitation"(id,email,"tenantId","token",expires) VALUES
  ('li-a','x@example.test','lt-a','raw-fixture-token-a',now()+interval '7 days'),
  ('li-b','y@example.test','lt-b','raw-fixture-token-b',now()+interval '7 days');
ALTER TABLE "ApplicationPart" ADD COLUMN "magicToken" TEXT;
INSERT INTO "ApplicationPart"(id,"tenantId","opportunityId",part,"magicToken","updatedAt") VALUES
  ('lap-a','lt-a','lo-a1','B1','raw-fixture-magic-a',now());

-- 33 credit-ledger-grant-period: monthly grants without grantPeriod
INSERT INTO "CreditLedger"(id,"tenantId",delta,reason,"refId") VALUES
  ('lcl-1','lt-a',100,'monthly_grant','monthly_grant:2026-08'),
  ('lcl-2','lt-b',100,'monthly_grant',NULL);

-- 38 m4-stale-reminder-idempotency: reminded relationships, no contact stamp, no digest day
INSERT INTO "Relationship"(id,"tenantId",kind,"counterpartName","ownerUserId","lastContactAt","staleRemindedAt","updatedAt") VALUES
  ('lr-a','lt-a','partner','p','lu-a',now()-interval '90 days',now()-interval '1 day',now()),
  ('lr-b','lt-b','partner','p','lu-b',now()-interval '90 days',now()-interval '2 days',now());
COMMIT;

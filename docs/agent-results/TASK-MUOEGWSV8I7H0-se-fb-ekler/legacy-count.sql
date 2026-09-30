-- Rows each FORCE-RLS backfill produced on the legacy fixture (read as superuser).
SELECT '07 rename-feedback-alert-columns   Feedback alertStatus=legacy', count(*) FROM "Feedback" WHERE id LIKE 'lf-%' AND "alertStatus"='legacy'
UNION ALL SELECT '08 retire-eur-plan-ladder         Subscription team->pro', count(*) FROM "Subscription" WHERE "tenantId" LIKE 'lt-%' AND "planId"='pro'
UNION ALL SELECT '14 topicmatch-per-opportunity     TopicMatch opportunityId set', count(*) FROM "TopicMatch" WHERE "tenantId"='lt-a' AND "opportunityId" IS NOT NULL
UNION ALL SELECT '21 add-stripe-event-log           StripeEventLog backfilled', count(*) FROM "StripeEventLog" WHERE "stripeEventId" LIKE 'evt_legacy_%'
UNION ALL SELECT '32 hash-bearer-tokens             Invitation tokenHash set', count(*) FROM "Invitation" WHERE id LIKE 'li-%' AND "tokenHash" IS NOT NULL
UNION ALL SELECT '32 hash-bearer-tokens             ApplicationPart magicTokenHash set', count(*) FROM "ApplicationPart" WHERE id LIKE 'lap-%' AND "magicTokenHash" IS NOT NULL
UNION ALL SELECT '33 credit-ledger-grant-period     CreditLedger grantPeriod set', count(*) FROM "CreditLedger" WHERE id LIKE 'lcl-%' AND "grantPeriod" IS NOT NULL
UNION ALL SELECT '38 m4-stale-reminder-idempotency  Relationship staleRemindedContactAt', count(*) FROM "Relationship" WHERE id LIKE 'lr-%' AND "staleRemindedContactAt" IS NOT NULL
UNION ALL SELECT '38 m4-stale-reminder-idempotency  Membership staleDigestOn', count(*) FROM "Membership" WHERE id LIKE 'lm-%' AND "staleDigestOn" IS NOT NULL
UNION ALL SELECT '41 m4-stale-digest-user-claim     User staleDigestOn', count(*) FROM "User" WHERE id LIKE 'lu-%' AND "staleDigestOn" IS NOT NULL
UNION ALL SELECT '32 (veri kaybı) Invitation.token kolonu var mı', count(*) FROM information_schema.columns WHERE table_name='Invitation' AND column_name='token';

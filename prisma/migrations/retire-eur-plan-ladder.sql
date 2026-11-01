-- TASK-MTR6QIE05ZKNH — retire the EUR five-plan ladder; the USD catalogue wins.
--
-- The product knew two plan ladders: the USD one the customer is shown and
-- charged (`basic/pro/ultra`, src/lib/billing/catalog.ts) and an internal EUR
-- one (`free/starter/team/business/enterprise`) that actually decided which
-- modules, seats, workspaces and credits a tenant got. Authorisation therefore
-- did not recognise what the customer had bought. Owner decision 2026-09-07:
-- the sales side wins.
--
-- Nothing is deleted before it has been moved. Subscriptions are re-pointed
-- first, the retired plan rows go last, and the mapping is capability
-- preserving — every target grants a superset of its source's modules, and
-- where the source allowed more seats or workspaces than the target (only
-- `enterprise` did), the difference is carried over as seatsExtra /
-- workspacesExtra rather than shrinking the tenant.
--
--   starter    → basic    entry paid tier → entry paid tier; same modules
--   team       → pro      mid tier → mid tier; same modules
--   business   → ultra    ultra is a superset (adds M7)
--   enterprise → ultra    ultra grants all 11 modules; capacity preserved below
--   free       → free     not a sales plan: the no-subscription fallback, kept
--
-- Rationale per row: docs/BILLING.md §9.
-- Down migration: retire-eur-plan-ladder.down.sql

BEGIN;

-- 1. The surviving plans, from src/lib/billing/catalog.ts (list prices; the
--    campaign discount is applied at checkout, never persisted here).
INSERT INTO "Plan" (id, name, "monthlyCents", "yearlyCents", currency, seats, workspaces, "aiCreditsMonthly", modules)
VALUES
  ('free',  'Discover',      0,      0, 'USD',  1, 1,   10, ARRAY['M3','M5']),
  ('basic', 'Basic',      4500,  38700, 'USD',  2, 1,  100, ARRAY['M2','M3','M5']),
  ('pro',   'Pro',        8700,  74700, 'USD',  6, 1,  500, ARRAY['M1','M2','M3','M4','M5','M8']),
  ('ultra', 'Ultra',     14700, 119700, 'USD', 15, 5, 2000, ARRAY['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11'])
ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  "monthlyCents"     = EXCLUDED."monthlyCents",
  "yearlyCents"      = EXCLUDED."yearlyCents",
  currency           = EXCLUDED.currency,
  seats              = EXCLUDED.seats,
  workspaces         = EXCLUDED.workspaces,
  "aiCreditsMonthly" = EXCLUDED."aiCreditsMonthly",
  modules            = EXCLUDED.modules;

-- 2. Preserve capacity for anyone above the new ceiling, BEFORE re-pointing the
--    row (after the update we could no longer tell where it came from). Only
--    `enterprise` (999 seats / 999 workspaces) exceeds `ultra` (15 / 5).
UPDATE "Subscription" s
SET "seatsExtra"      = s."seatsExtra"      + GREATEST(old.seats      - new_plan.seats,      0),
    "workspacesExtra" = s."workspacesExtra" + GREATEST(old.workspaces - new_plan.workspaces, 0)
FROM "Plan" old, "Plan" new_plan
WHERE old.id = s."planId"
  AND s."planId" IN ('starter','team','business','enterprise')
  AND new_plan.id = CASE s."planId"
        WHEN 'starter'    THEN 'basic'
        WHEN 'team'       THEN 'pro'
        WHEN 'business'   THEN 'ultra'
        WHEN 'enterprise' THEN 'ultra'
      END;

-- 3. Re-point the subscriptions. No row is created or dropped, so the count
--    before and after this statement is identical.
UPDATE "Subscription"
SET "planId" = CASE "planId"
      WHEN 'starter'    THEN 'basic'
      WHEN 'team'       THEN 'pro'
      WHEN 'business'   THEN 'ultra'
      WHEN 'enterprise' THEN 'ultra'
    END
WHERE "planId" IN ('starter','team','business','enterprise');

-- 4. Refuse to drop a plan anything still points at. `Subscription.planId` has
--    no foreign key, so this is the only thing standing between a typo above
--    and a tenant whose plan cannot be resolved.
DO $$
DECLARE orphaned INT;
BEGIN
  SELECT count(*) INTO orphaned
  FROM "Subscription"
  WHERE "planId" NOT IN ('free','basic','pro','ultra');
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'refusing to retire plans: % subscription(s) still on an unmapped plan', orphaned;
  END IF;
END $$;

-- 5. The retired rows.
DELETE FROM "Plan" WHERE id IN ('starter','team','business','enterprise');

-- 6. New rows are USD from here on.
ALTER TABLE "Plan" ALTER COLUMN currency SET DEFAULT 'USD';

COMMIT;

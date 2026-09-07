-- Reverses retire-eur-plan-ladder.sql.
--
-- Caveat, stated rather than hidden: the forward mapping is many-to-one
-- (`business` and `enterprise` both became `ultra`), so it cannot be inverted
-- exactly. Every `ultra` subscription comes back as `business`, which is the
-- lower of the two and therefore never restores more than the tenant had. A
-- tenant that was genuinely on `enterprise` keeps the capacity the forward
-- migration parked on seatsExtra / workspacesExtra, so no seat is lost either
-- way; the extras are deliberately not unwound, because after the roll-forward
-- an operator may have edited them.

BEGIN;

INSERT INTO "Plan" (id, name, "monthlyCents", "yearlyCents", currency, seats, workspaces, "aiCreditsMonthly", modules)
VALUES
  ('free',       'Discover',        0,       0, 'EUR',   1,   1,    10, ARRAY['M3','M5']),
  ('starter',    'Starter',      5900,   56600, 'EUR',   2,   1,   100, ARRAY['M3','M5','M2']),
  ('team',       'Team',        24900,  239000, 'EUR',   6,   1,   500, ARRAY['M1','M2','M3','M4','M5','M8']),
  ('business',   'Business',    59900,  575000, 'EUR',  15,   5,  2000, ARRAY['M1','M2','M3','M4','M5','M8','M6','M9','M10','M11']),
  ('enterprise', 'Enterprise', 150000, 1440000, 'EUR', 999, 999, 10000, ARRAY['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11'])
ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  "monthlyCents"     = EXCLUDED."monthlyCents",
  "yearlyCents"      = EXCLUDED."yearlyCents",
  currency           = EXCLUDED.currency,
  seats              = EXCLUDED.seats,
  workspaces         = EXCLUDED.workspaces,
  "aiCreditsMonthly" = EXCLUDED."aiCreditsMonthly",
  modules            = EXCLUDED.modules;

UPDATE "Subscription"
SET "planId" = CASE "planId"
      WHEN 'basic' THEN 'starter'
      WHEN 'pro'   THEN 'team'
      WHEN 'ultra' THEN 'business'
    END
WHERE "planId" IN ('basic','pro','ultra');

DELETE FROM "Plan" WHERE id IN ('basic','pro','ultra');

ALTER TABLE "Plan" ALTER COLUMN currency SET DEFAULT 'EUR';

COMMIT;

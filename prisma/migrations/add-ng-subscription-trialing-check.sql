-- ─────────────────────────────────────────────────────────────────────────────
-- add-ng-subscription-trialing-check.sql (NG-250, review U3)
--
-- Purpose: a TRIALING "NgSubscription" row always carries the facts its end needs —
-- "trialEndsAt" (when) and "trialEndPlanId" (to which plan). Without them `trialExpiryOf`
-- never drops the row and the trial plan stays open for good. `startNgTrial` always writes
-- both; this makes the database refuse any other writer that does not.
--
--   CHECK (status <> 'TRIALING' OR ("trialEndsAt" IS NOT NULL AND "trialEndPlanId" IS NOT NULL))
--
-- Additive: one CHECK, no column, no row changed. Existing rows that break it are NOT fixed
-- here: the migration stops with their count instead (a trial without an end needs a human
-- decision, not a guessed date).
--
-- Idempotent: guarded by pg_constraint; a second run is a no-op.
-- Rollback: add-ng-subscription-trialing-check.down.sql (drops the CHECK only).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  broken integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NgSubscription_trialing_has_end_check') THEN
    SELECT count(*) INTO broken FROM "NgSubscription"
      WHERE status = 'TRIALING' AND ("trialEndsAt" IS NULL OR "trialEndPlanId" IS NULL);
    IF broken > 0 THEN
      RAISE EXCEPTION 'NG-250: % TRIALING NgSubscription row(s) lack trialEndsAt or trialEndPlanId; fix them before this CHECK', broken;
    END IF;
    ALTER TABLE "NgSubscription"
      ADD CONSTRAINT "NgSubscription_trialing_has_end_check"
      CHECK (status <> 'TRIALING' OR ("trialEndsAt" IS NOT NULL AND "trialEndPlanId" IS NOT NULL));
  END IF;
END $$;

-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-lifetime-licence.down.sql — rollback for add-lifetime-licence.sql
--
-- DESTRUCTIVE: drops the LifetimeLicence table and with it every record of a
-- lifetime sale. These rows are the only place a one-time purchase is written
-- down — Stripe has the payment, this database would have nothing. Export first:
--   \copy (SELECT * FROM "LifetimeLicence") TO 'lifetime-licences-backup.csv' CSV HEADER
--
-- After this runs the pricing badge stops claiming an owner count (the counter
-- function is gone, the page falls back to "limited to the first 20"), which is
-- the intended failure mode: no number rather than a wrong one.
--
-- Idempotent: IF EXISTS throughout, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.lifetime_licence_count();
DROP TABLE IF EXISTS "LifetimeLicence";

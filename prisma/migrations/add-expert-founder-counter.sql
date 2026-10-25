-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-founder-counter.sql — TASK-MVC91K7JYOWQC (FO-50 · FB-UZMAN)
--
-- Purpose: patron decision K-568932 = A. The "Kurucu Uzman" number used to be
-- `max(founderNumber) + 1` over ExpertPreRegistration, so the one-year purge had
-- to keep the row holding the maximum (its name, e-mail, province, ORCID) or the
-- number would be handed out again. The numbers now come from this one-row
-- counter, which only goes up. The purge deletes every row older than one year,
-- the top founder too, and neither the next number nor the seat count moves.
--
-- Start value: the highest founder number already given, so no number is reused.
-- The INSERT ... ON CONFLICT only ever raises the stored value, so a second run,
-- or a run after numbers were given (or rows purged), never lowers the counter.
--
-- RLS: ON, the one policy `system_scope`, the same as ExpertPreRegistration
-- (FO-45). The app role reads and writes it only inside withSystemScope(). The
-- policy needs prisma/rls.sql's system_scope_open; a database where the chain
-- runs this file before rls.sql gets a NOTICE here, and rls.sql (same block)
-- creates the policy on `pnpm db:rls`.
--
-- The database refuses to lower the counter (BEFORE UPDATE trigger) and the app
-- role cannot DELETE or TRUNCATE it (crw-fb Ö-1).
--
-- Idempotent: IF NOT EXISTS, ON CONFLICT, CREATE OR REPLACE FUNCTION, DROP
-- POLICY / TRIGGER IF EXISTS before CREATE.
--
-- Rollback: prisma/migrations/add-expert-founder-counter.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExpertFounderCounter" (
    "id"         INTEGER NOT NULL DEFAULT 1,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpertFounderCounter_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpertFounderCounter_single_row') THEN
    ALTER TABLE "ExpertFounderCounter" ADD CONSTRAINT "ExpertFounderCounter_single_row" CHECK ("id" = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpertFounderCounter_lastNumber_nonneg') THEN
    ALTER TABLE "ExpertFounderCounter" ADD CONSTRAINT "ExpertFounderCounter_lastNumber_nonneg" CHECK ("lastNumber" >= 0);
  END IF;
END $$;

-- "Only goes up", held by the database and not only by the code (crw-fb Ö-1):
-- an UPDATE that lowers lastNumber is refused for every role. The owner restores
-- a test value with DELETE + INSERT (no UPDATE), which the app role cannot do:
-- it has no DELETE or TRUNCATE here (below).
CREATE OR REPLACE FUNCTION public.expert_founder_counter_no_decrease() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'ExpertFounderCounter.lastNumber only goes up (% -> %)', OLD."lastNumber", NEW."lastNumber"
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.expert_founder_counter_no_decrease() FROM PUBLIC;
DROP TRIGGER IF EXISTS "ExpertFounderCounter_no_decrease" ON "ExpertFounderCounter";
CREATE TRIGGER "ExpertFounderCounter_no_decrease"
  BEFORE UPDATE ON "ExpertFounderCounter"
  FOR EACH ROW WHEN (NEW."lastNumber" < OLD."lastNumber")
  EXECUTE FUNCTION public.expert_founder_counter_no_decrease();

INSERT INTO "ExpertFounderCounter" ("id", "lastNumber", "updatedAt")
SELECT 1, COALESCE(MAX("founderNumber"), 0), CURRENT_TIMESTAMP FROM "ExpertPreRegistration"
ON CONFLICT ("id") DO UPDATE
  SET "lastNumber" = EXCLUDED."lastNumber",
      "updatedAt"  = CURRENT_TIMESTAMP
  WHERE EXCLUDED."lastNumber" > "ExpertFounderCounter"."lastNumber";

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    ALTER TABLE "ExpertFounderCounter" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON "ExpertFounderCounter";
    CREATE POLICY system_scope ON "ExpertFounderCounter"
      USING ((SELECT public.system_scope_open('"ExpertFounderCounter"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ExpertFounderCounter"'::regclass)));
  ELSE
    RAISE NOTICE 'add-expert-founder-counter: system_scope_open missing (rls.sql not yet applied); RLS left as it is';
  END IF;
END $$;

-- Same grant as ExpertPreRegistration (add-expert-pre-registration.sql): default
-- privileges only cover roles that existed when prisma/rls-app-role.sql last ran.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "ExpertFounderCounter" TO fabrika_app;
    -- Default privileges hand it DELETE at CREATE TABLE; a deleted row would let the
    -- next verification fall back to the rows' max and reuse a purged number.
    -- Also revoked in prisma/rls.sql and prisma/rls-app-role.sql (db:rls-role re-grants DELETE on all tables).
    REVOKE DELETE, TRUNCATE ON "ExpertFounderCounter" FROM fabrika_app;
  END IF;
END $$;

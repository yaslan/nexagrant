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
-- Idempotent: IF NOT EXISTS, ON CONFLICT, DROP POLICY IF EXISTS before CREATE.
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
  END IF;
END $$;

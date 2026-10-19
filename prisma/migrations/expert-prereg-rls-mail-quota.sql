-- ─────────────────────────────────────────────────────────────────────────────
-- expert-prereg-rls-mail-quota.sql — TASK-MVC6CTSCLO6LI (FO-45 · FB-UZMAN)
--
-- Purpose, three things on "ExpertPreRegistration":
--  1. RLS on (K-562266 = A). Until now the table had none, and the app role read
--     every expert's personal data with a plain SELECT. Now the only policy is
--     `system_scope`: fabrika_app sees 0 rows and cannot write outside
--     withSystemScope(). Reads and writes go through src/lib/expert-prereg/server/.
--  2. A daily mail quota per e-mail address (F5): verifyMailCount counts the
--     verification mails sent in the window that starts at verifyMailWindowStart.
--  3. Nothing else changes. Existing rows keep every value; the new columns
--     default to zero/NULL, which means "no mail sent yet in a window".
--
-- The RLS part needs the functions of prisma/rls.sql (system_scope_open). A
-- database where the chain runs this file before rls.sql has neither, so the
-- policy and ENABLE are skipped with a NOTICE. rls.sql then creates them on
-- `pnpm db:rls` (it has the same block). Nothing is left RLS-on with no policy.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE.
-- A second run is a no-op.
--
-- Rollback: prisma/migrations/expert-prereg-rls-mail-quota.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ExpertPreRegistration" ADD COLUMN IF NOT EXISTS "verifyMailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExpertPreRegistration" ADD COLUMN IF NOT EXISTS "verifyMailWindowStart" TIMESTAMP(3);

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    ALTER TABLE public."ExpertPreRegistration" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."ExpertPreRegistration";
    CREATE POLICY system_scope ON public."ExpertPreRegistration"
      USING ((SELECT public.system_scope_open('"ExpertPreRegistration"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ExpertPreRegistration"'::regclass)));
  ELSE
    RAISE NOTICE 'expert-prereg-rls-mail-quota: system_scope_open missing (rls.sql not yet applied); RLS left as it is';
  END IF;
END $$;

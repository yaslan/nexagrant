-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-reg-attempt.sql — TASK-MVBLYRLP9ID93 (FO-26: uzman ön kayıt sayacı)
--
-- Purpose: two additive changes to the expert pre-registration (FO-19/FO-23).
--  1. ExpertPreRegistration.lastSubmittedAt — the last time a registration reached
--     the write. The resend cooldown reads it; createdAt no longer moves on a
--     re-issued link, so the first registration time is kept.
--  2. ExpertPreRegAttempt — one row per submission that reaches the write without
--     creating a row (a 409 for a verified address, or a re-issued link). The
--     per-IP window counts these too (src/lib/expert-prereg/server/register.ts).
--     Rows older than 24 hours are deleted on every submission.
--
-- RLS: ON, with the one policy `system_scope` (K-562266 = A, as ExpertPreRegistration
-- since FO-45 and ExpertFounderCounter since FO-50). The HMAC of an IP is pseudonymous
-- personal data under KVKK/GDPR, and an empty counter lifts the per-IP limit, so
-- fabrika_app reads and writes it only inside withSystemScope() ('public-intake',
-- register.ts). Outside that scope it sees 0 rows and refuses every write. It sits in
-- SYSTEM_SCOPE_POLICY in scripts/rls-models.ts; prisma/rls.sql has the same block.
--
-- The policy needs system_scope_open() from prisma/rls.sql. A database where the chain
-- runs this file before rls.sql has neither, so RLS is DISABLEd there with a NOTICE
-- (Supabase's `ensure_rls` trigger would otherwise leave it on with no policy:
-- deny-all for fabrika_app). rls.sql turns it on with the policy on `pnpm db:rls`.
--
-- Idempotent: IF NOT EXISTS throughout, DROP POLICY IF EXISTS before CREATE, so a
-- second run is a no-op.
--
-- Rollback: prisma/migrations/add-expert-pre-reg-attempt.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ExpertPreRegistration" ADD COLUMN IF NOT EXISTS "lastSubmittedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ExpertPreRegAttempt" (
    "id"        TEXT NOT NULL,
    "ipHash"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpertPreRegAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExpertPreRegAttempt_createdAt_idx" ON "ExpertPreRegAttempt"("createdAt");
CREATE INDEX IF NOT EXISTS "ExpertPreRegAttempt_ipHash_createdAt_idx" ON "ExpertPreRegAttempt"("ipHash", "createdAt");

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    ALTER TABLE "ExpertPreRegAttempt" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON "ExpertPreRegAttempt";
    CREATE POLICY system_scope ON "ExpertPreRegAttempt"
      USING ((SELECT public.system_scope_open('"ExpertPreRegAttempt"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ExpertPreRegAttempt"'::regclass)));
  ELSE
    ALTER TABLE "ExpertPreRegAttempt" DISABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'add-expert-pre-reg-attempt: system_scope_open missing (rls.sql not yet applied); RLS off until pnpm db:rls';
  END IF;
END $$;

-- The application role needs DML here like on every other table (same reasoning as
-- add-public-lead.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpertPreRegAttempt" TO fabrika_app;
  END IF;
END $$;

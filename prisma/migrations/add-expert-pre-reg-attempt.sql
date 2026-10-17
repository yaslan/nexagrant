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
-- RLS: none, on purpose. The table holds no tenant and no personal data beyond the
-- HMAC of an IP; it sits in SYSTEM_WIDE in scripts/rls-models.ts, the same standing as
-- ExpertPreRegistration and PublicLead.
--
-- RLS is DISABLEd explicitly right after CREATE TABLE (TASK-MUWDA86A7U4LK): Supabase's
-- `ensure_rls` event trigger ENABLEs it on every new table in public, and RLS on with
-- no policy is deny-all for fabrika_app. scripts/rls-migrations.ts CHECK 4c enforces it.
--
-- Idempotent: IF NOT EXISTS throughout, so a second run is a no-op.
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
ALTER TABLE "ExpertPreRegAttempt" DISABLE ROW LEVEL SECURITY;  -- Supabase ensure_rls turns it on; this table is policy-less by design (rls-models.ts SYSTEM_WIDE)

CREATE INDEX IF NOT EXISTS "ExpertPreRegAttempt_createdAt_idx" ON "ExpertPreRegAttempt"("createdAt");
CREATE INDEX IF NOT EXISTS "ExpertPreRegAttempt_ipHash_createdAt_idx" ON "ExpertPreRegAttempt"("ipHash", "createdAt");

-- The application role needs DML here like on every other table (same reasoning as
-- add-public-lead.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpertPreRegAttempt" TO fabrika_app;
  END IF;
END $$;

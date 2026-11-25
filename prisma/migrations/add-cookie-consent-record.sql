-- ─────────────────────────────────────────────────────────────────────────────
-- add-cookie-consent-record.sql — NG-9 (FE-1.5: çerez bandı, tercih paneli, rıza kaydı)
--
-- Purpose: "CookieConsentRecord" — one row per cookie choice a visitor saves on the
-- banner or the preference panel: an anonymous visitor id (a random UUID minted in
-- the browser, not derived from anything), the choice, the analytics / marketing
-- categories, the policy version shown and the time. The proof of consent KVKK and
-- GDPR art. 7(1) ask for, in our own database. No IP, no user agent, no user id.
--
-- RLS: ON, with the one policy `system_scope` (like ExpertPreRegAttempt). The visitor
-- id is a pseudonymous identifier, and a tenant session has no business reading it:
-- fabrika_app writes it only inside withSystemScope('public-intake')
-- (src/lib/cookie-consent-record.ts); prisma/rls.sql system_scope_open() opens it
-- for 'public-intake', 'platform-admin' and 'cross-tenant-job' only. It sits in
-- SYSTEM_SCOPE_POLICY in scripts/rls-models.ts; prisma/rls.sql has the same block.
--
-- The policy needs system_scope_open() from prisma/rls.sql. A database where the chain
-- runs this file before rls.sql has neither, so RLS is DISABLEd there with a NOTICE
-- (Supabase's `ensure_rls` trigger would otherwise leave it on with no policy:
-- deny-all for fabrika_app). rls.sql turns it on with the policy on `pnpm db:rls`.
--
-- Idempotent: IF NOT EXISTS throughout, DROP POLICY IF EXISTS before CREATE.
-- Rollback: prisma/migrations/add-cookie-consent-record.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CookieConsentRecord" (
    "id"            TEXT NOT NULL,
    "visitorId"     TEXT NOT NULL,
    "choice"        TEXT NOT NULL,
    "analytics"     BOOLEAN NOT NULL,
    "marketing"     BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "locale"        TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CookieConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CookieConsentRecord_visitorId_createdAt_idx" ON "CookieConsentRecord"("visitorId", "createdAt");
CREATE INDEX IF NOT EXISTS "CookieConsentRecord_createdAt_idx" ON "CookieConsentRecord"("createdAt");

DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    ALTER TABLE "CookieConsentRecord" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON "CookieConsentRecord";
    CREATE POLICY system_scope ON "CookieConsentRecord"
      USING ((SELECT public.system_scope_open('"CookieConsentRecord"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"CookieConsentRecord"'::regclass)));
  ELSE
    ALTER TABLE "CookieConsentRecord" DISABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'add-cookie-consent-record: system_scope_open missing (rls.sql not yet applied); RLS off until pnpm db:rls';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CookieConsentRecord" TO fabrika_app;
  END IF;
END $$;

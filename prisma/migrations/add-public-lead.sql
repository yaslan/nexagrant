-- ─────────────────────────────────────────────────────────────────────────────
-- add-public-lead.sql — TASK-MULR765AR5G0C (FB KAMU: kayıtsız ziyaretçi lead'i)
--
-- Purpose: the funding-readiness result screen (/tr/fon-hazirlik) gets a
-- contact form. A visitor who ticks the explicit-consent box leaves a name, an
-- e-mail address, an organisation and optionally a province/district; the row
-- is read by platform admins only (/admin/leads) and deleted by the nightly
-- `public-lead-cleanup` job once it is older than PUBLIC_LEAD_RETENTION_DAYS
-- (src/lib/leads/public-lead.ts). docs/legal/processing-register.md §18d.
--
-- RLS: none, on purpose. The row belongs to no tenant (the visitor has no
-- account), so there is no tenantId to isolate on — the same standing as
-- "User", "Account" and "SystemAlert". The table is listed in SYSTEM_WIDE in
-- scripts/rls-models.ts with that reason. No tenant code path reads it: the
-- only reader is the platform-admin console, behind requirePlatformAdmin().
--
-- RLS is DISABLEd explicitly right after CREATE TABLE (TASK-MUWDA86A7U4LK):
-- Supabase's `ensure_rls` event trigger ENABLEs it on every new table in
-- public, and RLS on with no policy is deny-all for fabrika_app. A no-op where
-- it is already off. scripts/rls-migrations.ts CHECK 4c enforces the line.
--
-- Idempotent: IF NOT EXISTS throughout, so a database built by `prisma db push`
-- first, or a second run, is a no-op.
--
-- Rollback: prisma/migrations/add-public-lead.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PublicLead" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "organisation"   TEXT NOT NULL,
    "province"       TEXT,
    "district"       TEXT,
    "readinessCode"  TEXT,
    "readinessTotal" INTEGER,
    "readinessLevel" TEXT,
    "consentVersion" TEXT NOT NULL,
    "consentAt"      TIMESTAMP(3) NOT NULL,
    "source"         TEXT NOT NULL,
    "locale"         TEXT NOT NULL,
    "ipHash"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicLead_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PublicLead" DISABLE ROW LEVEL SECURITY;  -- Supabase ensure_rls turns it on; this table is policy-less by design (rls-models.ts SYSTEM_WIDE)

CREATE INDEX IF NOT EXISTS "PublicLead_createdAt_idx" ON "PublicLead"("createdAt");
CREATE INDEX IF NOT EXISTS "PublicLead_email_createdAt_idx" ON "PublicLead"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "PublicLead_ipHash_createdAt_idx" ON "PublicLead"("ipHash", "createdAt");

-- The application role needs DML here like on every other table; default
-- privileges only cover roles that existed when prisma/rls-app-role.sql last
-- ran (same reasoning as add-stripe-event-log/migration.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PublicLead" TO fabrika_app;
  END IF;
END $$;

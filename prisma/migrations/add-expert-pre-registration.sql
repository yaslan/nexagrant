-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-registration.sql — TASK-MVBIXPP33UK1B (FO-19 · FB-UZMAN)
--
-- Purpose: the public pre-registration form for EU project experts. An expert
-- with no account leaves a profile; a signed one-time link in the mail verifies
-- it; the first 100 verified experts get a "Kurucu Uzman" number (founderNumber).
-- Platform admins list the rows and export them as CSV.
--
-- RLS: none, on purpose — the same standing as "PublicLead". The row belongs to
-- no tenant, and the app role must write it (live runs as fabrika_app). A deny-all
-- policy would refuse the registration; a "read all" policy (platform_read
-- USING (true)) would let any tenant session read every expert's personal data.
-- So access is enforced in code: the only writers and readers are
-- src/lib/expert-prereg/server/, and the admin reads sit behind
-- requirePlatformAdminApi(). The table is listed in SYSTEM_WIDE in
-- scripts/rls-models.ts, and RLS is DISABLEd explicitly right after CREATE TABLE
-- (TASK-MUWDA86A7U4LK: Supabase's ensure_rls event trigger turns it on).
--
-- Stored: no raw IP (ipHash = HMAC), no raw verification token (verifyTokenHash
-- = SHA-256). Personal data. Retention is an open decision (docs/DATA_MODEL.md §22):
-- no purge job ships with this table yet.
--
-- Idempotent: IF NOT EXISTS throughout, so a database built by `prisma db push`
-- first, or a second run, is a no-op.
--
-- Rollback: prisma/migrations/add-expert-pre-registration.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExpertPreRegistration" (
    "id"                   TEXT NOT NULL,
    "fullName"             TEXT NOT NULL,
    "email"                TEXT NOT NULL,
    "emailVerifiedAt"      TIMESTAMP(3),
    "province"             TEXT NOT NULL,
    "title"                TEXT,
    "isFreelancer"         BOOLEAN NOT NULL,
    "expertiseAreas"       TEXT[] NOT NULL,
    "roles"                TEXT[] NOT NULL,
    "programmes"           TEXT[] NOT NULL,
    "projectCodes"         TEXT,
    "orcid"                TEXT,
    "linkedinUrl"          TEXT,
    "languages"            TEXT[] NOT NULL,
    "referredBy"           TEXT,
    "utmSource"            TEXT,
    "utmMedium"            TEXT,
    "utmCampaign"          TEXT,
    "kvkkAcceptedAt"       TIMESTAMP(3) NOT NULL,
    "visibilityConsentAt"  TIMESTAMP(3) NOT NULL,
    "marketingConsentAt"   TIMESTAMP(3),
    "consentTextVersion"   TEXT NOT NULL DEFAULT 'kvkk-v1',
    "locale"               TEXT NOT NULL,
    "verifyTokenHash"      TEXT,
    "verifyTokenExpiresAt" TIMESTAMP(3),
    "founderNumber"        INTEGER,
    "status"               TEXT NOT NULL DEFAULT 'pending',
    "ipHash"               TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpertPreRegistration_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExpertPreRegistration" DISABLE ROW LEVEL SECURITY;  -- Supabase ensure_rls turns it on; this table is policy-less by design (rls-models.ts SYSTEM_WIDE)

CREATE UNIQUE INDEX IF NOT EXISTS "ExpertPreRegistration_email_key" ON "ExpertPreRegistration"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpertPreRegistration_verifyTokenHash_key" ON "ExpertPreRegistration"("verifyTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpertPreRegistration_founderNumber_key" ON "ExpertPreRegistration"("founderNumber");
CREATE INDEX IF NOT EXISTS "ExpertPreRegistration_createdAt_idx" ON "ExpertPreRegistration"("createdAt");
CREATE INDEX IF NOT EXISTS "ExpertPreRegistration_ipHash_createdAt_idx" ON "ExpertPreRegistration"("ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "ExpertPreRegistration_status_createdAt_idx" ON "ExpertPreRegistration"("status", "createdAt");

-- The application role needs DML here like on every other table; default
-- privileges only cover roles that existed when prisma/rls-app-role.sql last
-- ran (same reasoning as add-public-lead.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpertPreRegistration" TO fabrika_app;
  END IF;
END $$;

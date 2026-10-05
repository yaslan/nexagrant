-- ─────────────────────────────────────────────────────────────────────────────
-- add-consent-record.sql — TASK-MTSWLANXSU0IG (A3)
--
-- Purpose: there was no record anywhere of which legal text a person was shown,
-- when, or at which version. GDPR art.5(2) puts the burden of DEMONSTRATING
-- compliance on the controller, so an undocumented disclosure is a failed one
-- even when it happened.
--
-- Scope is set by docs/legal/processing-register.md: account creation (§1) is
-- contract basis, so what registration owes is a disclosure acknowledgement
-- (KVKK md.10 / GDPR art.13) plus terms acceptance — not consent. §11 (calendar
-- OAuth) is the only genuinely consent-based activity and writes nothing yet.
-- `kind` keeps those apart rather than calling all three "consent".
--
-- RLS: tenant-scoped, so it joins the `tenant_isolation` loop in prisma/rls.sql.
-- Applying this file alone is NOT enough — run `pnpm db:rls` after it, or the
-- table is left readable across tenants. `pnpm rls:check` fails until the model
-- is named in rls.sql; `pnpm rls:verify` fails until the database really has
-- the policy.
--
-- Rollback: prisma/migrations/add-consent-record.down.sql
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsentKind') THEN
    CREATE TYPE "ConsentKind" AS ENUM ('DISCLOSURE_ACK', 'TERMS_ACCEPTANCE', 'EXPLICIT_CONSENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsentPurpose') THEN
    CREATE TYPE "ConsentPurpose" AS ENUM ('ACCOUNT_REGISTRATION', 'CALENDAR_OAUTH');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Consent" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  -- No FK to "User", and no ON DELETE. The record must outlive the account it
  -- names (see the model comment in prisma/schema.prisma), exactly as
  -- "DualApprovalStep"."actorUserId" does.
  "userId"          TEXT NOT NULL,
  "kind"            "ConsentKind" NOT NULL,
  "purpose"         "ConsentPurpose" NOT NULL,
  "documentId"      TEXT NOT NULL,
  "documentVersion" TEXT NOT NULL,
  "locale"          TEXT NOT NULL DEFAULT 'tr',
  "grantedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Consent_tenantId_userId_purpose_idx"
  ON "Consent" ("tenantId", "userId", "purpose");
CREATE INDEX IF NOT EXISTS "Consent_tenantId_purpose_documentVersion_idx"
  ON "Consent" ("tenantId", "purpose", "documentVersion");
CREATE INDEX IF NOT EXISTS "Consent_userId_grantedAt_idx"
  ON "Consent" ("userId", "grantedAt");

-- Stated here as well as in prisma/rls.sql so a database repaired with this
-- file alone is not left without isolation on a table of legal records.
ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Consent";
CREATE POLICY tenant_isolation ON "Consent"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

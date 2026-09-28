-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-invite-code.sql — TASK-MULRQJQYM0NAM (FB KAMU B1)
--
-- Purpose: a development agency (first candidate: OKA) hands out free Discover
-- accounts in its region with ONE multi-use code. Every tenant opened with a
-- code is linked to the agency, which is what the agency dashboard (B2) and the
-- regional report (B3) count.
--
-- Shape (design approved by leed-fb, quoted in
-- docs/agent-results/TASK-MULRQJQYM0NAM-be-fb.md):
--   * An agency is a Tenant with kind = 'AGENCY'. Its staff are ordinary
--     Memberships of that tenant; there is no separate agency model or role.
--   * "Tenant"."agencyId" is written once, at registration, in the same
--     transaction that uses the code.
--   * "AgencyInviteCode"."tenantId" is the AGENCY's tenant id. It is named
--     tenantId so the standard `tenant_isolation` policy and every RLS check
--     (rls:check, rls-migrations, rls:verify, system_scope) cover it unchanged.
--   * The code itself is never stored: only its SHA-256 and the last four
--     characters for display.
--
-- The linkage grants the agency NOTHING on the linked tenant's rows. No policy
-- anywhere reads "agencyId"; an agency session runs with app.tenant_id = the
-- agency, so every tenant-scoped table returns zero rows of a linked tenant.
-- Aggregate numbers for B2/B3 will come from count-only SECURITY DEFINER
-- functions, not from a widened policy.
--
-- RLS: "AgencyInviteCode" joins the `tenant_isolation` loop in prisma/rls.sql.
-- Run `pnpm db:rls` after this file: redeem_agency_invite() relies on the
-- `system_scope` policy that rls.sql derives for every tenant-scoped table.
--
-- Rollback: prisma/migrations/add-agency-invite-code.down.sql
-- Idempotent: every statement is IF NOT EXISTS / OR REPLACE / guarded.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantKind') THEN
    CREATE TYPE "TenantKind" AS ENUM ('ORGANIZATION', 'AGENCY');
  END IF;
END $$;

-- Existing tenants become ORGANIZATION through the default; nothing is rewritten.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "kind" "TenantKind" NOT NULL DEFAULT 'ORGANIZATION';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "agencyId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tenant_agencyId_fkey') THEN
    -- SET NULL: deleting an agency must not cascade into the organisations it
    -- invited. They keep their accounts; they only lose the link.
    ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_agencyId_fkey"
      FOREIGN KEY ("agencyId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Tenant_agencyId_idx" ON "Tenant" ("agencyId");

CREATE TABLE IF NOT EXISTS "AgencyInviteCode" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,             -- the agency
  "codeHash"  TEXT NOT NULL,             -- sha256 hex of the normalised code
  "codeHint"  TEXT NOT NULL,             -- last four characters, display only
  "label"     TEXT,
  "maxUses"   INTEGER NOT NULL,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyInviteCode_pkey" PRIMARY KEY ("id")
);

-- The CHECKs stand apart from CREATE TABLE (TASK-MULU7SAA4EPP8): where
-- `prisma db push` built the table first, which is how CI and a README setup
-- start, CREATE TABLE IF NOT EXISTS is skipped and inline CHECKs never land.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyInviteCode_maxUses_positive'
                   AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_maxUses_positive" CHECK ("maxUses" > 0);
  END IF;
  -- Second line behind redeem_agency_invite()'s WHERE clause: even a writer
  -- that bypasses the function cannot push the counter past the limit.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyInviteCode_usedCount_bounds'
                   AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_usedCount_bounds"
      CHECK ("usedCount" >= 0 AND "usedCount" <= "maxUses");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyInviteCode_codeHash_key" ON "AgencyInviteCode" ("codeHash");
CREATE INDEX IF NOT EXISTS "AgencyInviteCode_tenantId_createdAt_idx" ON "AgencyInviteCode" ("tenantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyInviteCode_tenantId_fkey') THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Stated here as well as in prisma/rls.sql so a database repaired with this
-- file alone is not left without isolation.
ALTER TABLE "AgencyInviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyInviteCode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgencyInviteCode";
CREATE POLICY tenant_isolation ON "AgencyInviteCode"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------------
-- redeem_agency_invite(code_hash) — the one door a registrant has to a code.
--
-- A registrant has no tenant yet, so `tenant_isolation` cannot let them near
-- the agency's row. This function does exactly one thing on their behalf: use
-- the code once, if it is usable, and say which agency it belongs to. It never
-- returns a row, so nothing about a code — whether it exists, is spent, expired
-- or revoked — is visible to the caller beyond "NULL".
--
-- Race: a single UPDATE takes the row lock and, under READ COMMITTED,
-- re-evaluates its WHERE clause against the committed row after the lock is
-- granted. Two registrations racing for the last use: the second one re-checks
-- "usedCount" < "maxUses", finds it false, updates nothing, gets NULL.
--
-- Scope: `SET app.system_scope = 'on'` below is a function-level setting, so
-- PostgreSQL restores the caller's previous value when the function exits —
-- normally or by error. It is what lets the UPDATE see the agency's row under
-- FORCE ROW LEVEL SECURITY without depending on the owner being BYPASSRLS, and
-- it cannot outlive this call. search_path is pinned against hijacking.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_agency_invite(code_hash text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
SET app.system_scope = 'on'
AS $fn$
DECLARE
  agency text;
BEGIN
  IF code_hash IS NULL OR code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  UPDATE "AgencyInviteCode" c
     SET "usedCount" = c."usedCount" + 1
    FROM "Tenant" a
   WHERE c."codeHash" = code_hash
     AND c."revokedAt" IS NULL
     AND c."expiresAt" > CURRENT_TIMESTAMP
     AND c."usedCount" < c."maxUses"
     AND a."id" = c."tenantId"
     AND a."kind" = 'AGENCY'
     AND a."deletedAt" IS NULL
  RETURNING c."tenantId" INTO agency;

  RETURN agency;
END
$fn$;

COMMENT ON FUNCTION public.redeem_agency_invite(text) IS
  'Uses an agency invite code once (atomically) and returns the agency tenant id, or NULL for any unusable code. Never returns a row. TASK-MULRQJQYM0NAM.';

REVOKE ALL ON FUNCTION public.redeem_agency_invite(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_agency_invite(text) TO fabrika_app';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- note_agency_invite_rejection(code_hash) — count a refused code, keep nothing
-- that identifies it.
--
-- There is no rate limit in front of registration (see the B1 report, Risks),
-- so failed attempts must at least be countable: an agency dashboard (B2) can
-- show "N refused attempts on your codes", and a burst of 'unknown' rows is a
-- guessing run. Called AFTER the registration transaction has rolled back —
-- inside it, the row would roll back too.
--
-- Written: type 'agency.invite.rejected' and a reason. Never the code, never
-- its hash, never who tried. When the hash matches a code the row is filed
-- under that code's agency; otherwise under no tenant (tenantId NULL).
-- Returns nothing, so the registrant learns nothing from calling it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.note_agency_invite_rejection(code_hash text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
SET app.system_scope = 'on'
AS $fn$
DECLARE
  agency text;
  reason text := 'unknown';
BEGIN
  IF code_hash IS NOT NULL AND code_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT c."tenantId",
           CASE
             WHEN c."revokedAt" IS NOT NULL THEN 'revoked'
             WHEN c."expiresAt" <= CURRENT_TIMESTAMP THEN 'expired'
             WHEN c."usedCount" >= c."maxUses" THEN 'exhausted'
             WHEN a."kind" <> 'AGENCY' OR a."deletedAt" IS NOT NULL THEN 'agency_inactive'
             ELSE 'lost_race'
           END
      INTO agency, reason
      FROM "AgencyInviteCode" c
      JOIN "Tenant" a ON a."id" = c."tenantId"
     WHERE c."codeHash" = code_hash;
    IF NOT FOUND THEN
      agency := NULL;
      reason := 'unknown';
    END IF;
  END IF;

  INSERT INTO "AuditEvent" ("id", "tenantId", "type", "data")
  VALUES (gen_random_uuid()::text, agency, 'agency.invite.rejected', jsonb_build_object('reason', reason));
END
$fn$;

COMMENT ON FUNCTION public.note_agency_invite_rejection(text) IS
  'Records one refused invite-code attempt as an AuditEvent (reason only; no code, hash or person). TASK-MULRQJQYM0NAM.';

REVOKE ALL ON FUNCTION public.note_agency_invite_rejection(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.note_agency_invite_rejection(text) TO fabrika_app';
  END IF;
END $$;

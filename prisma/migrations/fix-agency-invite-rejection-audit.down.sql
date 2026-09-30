-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for fix-agency-invite-rejection-audit.sql (TASK-MULU7GVFBTRXX K-6).
-- Restores note_agency_invite_rejection() exactly as add-agency-invite-code.sql
-- defines it: an unknown code is filed again as a "tenantId" NULL AuditEvent,
-- which every tenant can read. Rows are kept either way (the SystemAlert
-- counter row stays as history). Idempotent: CREATE OR REPLACE.

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

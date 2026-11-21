-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback for agency-invite-use-limit.sql (FO-392).
--
-- Restores both functions to the bodies of agency-invite-no-max-uses.sql (no use
-- limit, no 'exhausted' reason), drops the two CHECKs and the "useLimit" column.
--
-- CHANGES DATA: the "useLimit" values are dropped, so every code is unlimited
-- again, including codes created with the default limit. Rolling back reopens
-- the unbounded-use hole FO-392 closed. Before running, note the limits:
--   SELECT "id", "useLimit", "usedCount" FROM "AgencyInviteCode" WHERE "useLimit" IS NOT NULL;
-- Idempotent: running it twice changes nothing more.

ALTER TABLE "AgencyInviteCode" DROP CONSTRAINT IF EXISTS "AgencyInviteCode_usedCount_within_useLimit";
ALTER TABLE "AgencyInviteCode" DROP CONSTRAINT IF EXISTS "AgencyInviteCode_useLimit_positive";

CREATE OR REPLACE FUNCTION public.redeem_agency_invite(code_hash text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- In place of a function-level SET app.system_scope (Supabase: no SET ON PARAMETER, TASK-MUOG51GJ3PUOG).
  scope_was text := current_setting('app.system_scope', true);
  agency text;
BEGIN
  PERFORM set_config('app.system_scope', 'on', true);
  IF code_hash IS NULL OR code_hash !~ '^[0-9a-f]{64}$' THEN
    PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
    RETURN NULL;
  END IF;

  UPDATE "AgencyInviteCode" c
     SET "usedCount" = c."usedCount" + 1
    FROM "Tenant" a
   WHERE c."codeHash" = code_hash
     AND c."revokedAt" IS NULL
     AND c."expiresAt" > CURRENT_TIMESTAMP
     AND a."id" = c."tenantId"
     AND a."kind" = 'AGENCY'
     AND a."deletedAt" IS NULL
  RETURNING c."tenantId" INTO agency;

  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
  RETURN agency;
END
$fn$;

COMMENT ON FUNCTION public.redeem_agency_invite(text) IS
  'Uses an agency invite code (atomically) and returns the agency tenant id, or NULL for any unusable code: revoked, expired, unknown, agency inactive. No use limit. Never returns a row. TASK-MULRQJQYM0NAM, TASK-MUM4WVYLSH9IT.';

REVOKE ALL ON FUNCTION public.redeem_agency_invite(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_agency_invite(text) TO fabrika_app';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- note_agency_invite_rejection(code_hash): the body of
-- fix-agency-invite-rejection-audit.sql without the 'exhausted' branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.note_agency_invite_rejection(code_hash text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- In place of a function-level SET app.system_scope (Supabase: no SET ON PARAMETER, TASK-MUOG51GJ3PUOG).
  scope_was text := current_setting('app.system_scope', true);
  agency text;
  code_id text;
  reason text;
  alert_id text;
BEGIN
  PERFORM set_config('app.system_scope', 'on', true);
  IF code_hash IS NOT NULL AND code_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT c."tenantId",
           c."id",
           CASE
             WHEN c."revokedAt" IS NOT NULL THEN 'revoked'
             WHEN c."expiresAt" <= CURRENT_TIMESTAMP THEN 'expired'
             WHEN a."kind" <> 'AGENCY' OR a."deletedAt" IS NOT NULL THEN 'agency_inactive'
             ELSE 'lost_race'
           END
      INTO agency, code_id, reason
      FROM "AgencyInviteCode" c
      JOIN "Tenant" a ON a."id" = c."tenantId"
     WHERE c."codeHash" = code_hash;
  END IF;

  IF agency IS NOT NULL THEN
    INSERT INTO "AuditEvent" ("id", "tenantId", "type", "data")
    VALUES (gen_random_uuid()::text, agency, 'agency.invite.rejected',
            jsonb_build_object('reason', reason, 'codeId', code_id));
    PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
    RETURN;
  END IF;

  -- Unknown code: no tenant owns this attempt, so nothing tenant-readable.
  RAISE LOG 'agency invite code refused: unknown';

  SELECT s."id" INTO alert_id
    FROM "SystemAlert" s
   WHERE s."level" = 'info'
     AND s."source" = 'agency.invite'
     AND s."resolvedAt" IS NULL
     AND s."meta" ->> 'alertDedupeKey' = 'agency.invite.rejected.unknown'
   ORDER BY s."createdAt" DESC
   LIMIT 1
   FOR UPDATE;

  IF alert_id IS NOT NULL THEN
    UPDATE "SystemAlert"
       SET "meta" = COALESCE("meta", '{}'::jsonb) || jsonb_build_object(
             'alertRepeatCount', GREATEST(COALESCE(("meta" ->> 'alertRepeatCount')::int, 1), 1) + 1,
             'alertLastSeenAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     WHERE "id" = alert_id;
  ELSE
    INSERT INTO "SystemAlert" ("id", "level", "source", "message", "meta", "createdAt")
    VALUES (gen_random_uuid()::text, 'info', 'agency.invite',
            'Agency invite code refused: no such code (count in alertRepeatCount; a burst is a guessing run)',
            jsonb_build_object('alertDedupeKey', 'agency.invite.rejected.unknown'),
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  END IF;
  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
END
$fn$;

COMMENT ON FUNCTION public.note_agency_invite_rejection(text) IS
  'Records one refused invite-code attempt: under the agency (reason + code id) when the code exists, else as a count on one platform-only SystemAlert. Never the code, hash or person. No exhausted reason: codes have no use limit. TASK-MULRQJQYM0NAM, TASK-MULU7GVFBTRXX, TASK-MUM4WVYLSH9IT.';

REVOKE ALL ON FUNCTION public.note_agency_invite_rejection(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.note_agency_invite_rejection(text) TO fabrika_app';
  END IF;
END $$;

ALTER TABLE "AgencyInviteCode" DROP COLUMN IF EXISTS "useLimit";

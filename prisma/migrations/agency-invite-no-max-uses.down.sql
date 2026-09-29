-- Rollback for agency-invite-no-max-uses.sql (TASK-MUM4WVYLSH9IT).
--
-- Brings the use limit back: redeem_agency_invite() again refuses a code whose
-- "usedCount" reached "maxUses", note_agency_invite_rejection() again files
-- such a refusal as 'exhausted' (bodies as in add-agency-invite-code.sql and
-- fix-agency-invite-rejection-audit.sql), "maxUses" is NOT NULL again and the
-- bounds check is "usedCount" BETWEEN 0 AND "maxUses".
--
-- CHANGES DATA, only where the old shape cannot hold the row as it is:
--   * a code created without a limit ("maxUses" NULL) gets
--     GREATEST("usedCount", 10000): 10,000 was the old create-form maximum, so
--     the code keeps working as it did;
--   * a code used past its old limit gets "maxUses" = "usedCount": it becomes
--     used up, which is what the old rules would have made it.
-- Before running, note which rows those are:
--   SELECT "id", "maxUses", "usedCount" FROM "AgencyInviteCode"
--    WHERE "maxUses" IS NULL OR "usedCount" > "maxUses";
-- Rolling back reopens the probing channel the forward file closed
-- (TASK-MUM3TMP8HU76G-crw-fb.md, Kart 1 Ö-1). Idempotent: running it twice
-- changes nothing more.

-- Run as the migration role. The table is under FORCE ROW LEVEL SECURITY: a
-- non-superuser owner sees every agency's rows only with system_scope on, set
-- here for this transaction alone. Had it seen none, SET NOT NULL below fails
-- loudly instead of leaving a NULL behind.
BEGIN;
SET LOCAL app.system_scope = 'on';
UPDATE "AgencyInviteCode" SET "maxUses" = GREATEST("usedCount", 10000) WHERE "maxUses" IS NULL;
UPDATE "AgencyInviteCode" SET "maxUses" = "usedCount" WHERE "usedCount" > "maxUses";
COMMIT;

ALTER TABLE "AgencyInviteCode" ALTER COLUMN "maxUses" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'AgencyInviteCode_usedCount_bounds'
                AND conrelid = '"AgencyInviteCode"'::regclass
                AND pg_get_constraintdef(oid) NOT LIKE '%maxUses%') THEN
    ALTER TABLE "AgencyInviteCode" DROP CONSTRAINT "AgencyInviteCode_usedCount_bounds";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'AgencyInviteCode_usedCount_bounds'
                    AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_usedCount_bounds"
      CHECK ("usedCount" >= 0 AND "usedCount" <= "maxUses");
  END IF;
END $$;

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
  code_id text;
  reason text;
  alert_id text;
BEGIN
  IF code_hash IS NOT NULL AND code_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT c."tenantId",
           c."id",
           CASE
             WHEN c."revokedAt" IS NOT NULL THEN 'revoked'
             WHEN c."expiresAt" <= CURRENT_TIMESTAMP THEN 'expired'
             WHEN c."usedCount" >= c."maxUses" THEN 'exhausted'
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
END
$fn$;

COMMENT ON FUNCTION public.note_agency_invite_rejection(text) IS
  'Records one refused invite-code attempt: under the agency (reason + code id) when the code exists, else as a count on one platform-only SystemAlert. Never the code, hash or person. TASK-MULRQJQYM0NAM, TASK-MULU7GVFBTRXX.';

REVOKE ALL ON FUNCTION public.note_agency_invite_rejection(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.note_agency_invite_rejection(text) TO fabrika_app';
  END IF;
END $$;

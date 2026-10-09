-- ─────────────────────────────────────────────────────────────────────────────
-- agency-invite-no-max-uses.sql — TASK-MUM4WVYLSH9IT (FB KAMU B1, kod yoklama)
--
-- Purpose: an invite code has no use limit any more (leed-fb 29.09). A code is
-- governed only by its end date ("expiresAt") and by revocation ("revokedAt").
--
-- Why: the panel stopped saying "exhausted" (TASK-MUM2RMN3YIBGC), but an agency
-- that knows its own code could still try it on the registration form: a
-- refusal on a code it had neither revoked nor let expire meant used = max,
-- the very count the panel had dropped (TASK-MUM3TMP8HU76G-crw-fb.md, Kart 1
-- Ö-1). Whoever holds a code can test it, so hiding the state cannot close that
-- channel. With no limit, there is no "used up" state left to find out.
--
-- After this file:
--   * redeem_agency_invite() no longer compares "usedCount" with "maxUses".
--     "usedCount" still counts uses, as an internal counter nobody is shown.
--   * note_agency_invite_rejection() has no 'exhausted' reason.
--   * "maxUses" is nullable and unused. New codes leave it NULL; old rows keep
--     their value, which nothing reads. No row is changed.
--   * "AgencyInviteCode_usedCount_bounds" is now CHECK ("usedCount" >= 0). It
--     keeps its NAME on purpose: apply-order.txt re-runs every file, and
--     add-agency-invite-code.sql adds the old "usedCount" <= "maxUses" form
--     only when no constraint of that name exists. Dropping the name would let
--     the re-run bring the old check back and fail on any code used past its
--     old limit.
--
-- Idempotent: DROP NOT NULL is a no-op the second time; the constraint is
-- replaced only while its definition still mentions "maxUses"; functions are
-- CREATE OR REPLACE with the same signature, SECURITY DEFINER, SET clauses and
-- grants as before. Running it twice changes nothing.
--
-- Rollback: agency-invite-no-max-uses.down.sql (it has to give NULL limits a
-- value; read its header before running it).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AgencyInviteCode" ALTER COLUMN "maxUses" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'AgencyInviteCode_usedCount_bounds'
                AND conrelid = '"AgencyInviteCode"'::regclass
                AND pg_get_constraintdef(oid) LIKE '%maxUses%') THEN
    ALTER TABLE "AgencyInviteCode" DROP CONSTRAINT "AgencyInviteCode_usedCount_bounds";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'AgencyInviteCode_usedCount_bounds'
                    AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_usedCount_bounds"
      CHECK ("usedCount" >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- redeem_agency_invite(code_hash): same door as before, minus the limit. A code
-- is usable while it is not revoked, not expired and its agency is an active
-- agency. The single UPDATE still takes the row lock, so concurrent uses each
-- add one to "usedCount" and none is lost.
-- ---------------------------------------------------------------------------
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

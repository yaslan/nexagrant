-- ─────────────────────────────────────────────────────────────────────────────
-- agency-invite-use-limit.sql — FO-392 (se-fb)
--
-- Purpose: an agency invite code could be used without end. A code that leaks
-- opens any number of accounts that are exempt from the PIC lookup limit and
-- the shared daily budget (FO-389, PR #277). Measured on an isolated database:
-- one code, 300 registrations (200 in a row + 100 in parallel), 0 refused.
--
-- After this file:
--   * "AgencyInviteCode"."useLimit" INTEGER NULL: the number of uses a code may
--     reach over its life. NULL = unlimited, which is every row that exists now:
--     no row is changed, so the codes agencies use today work as they did.
--     A NEW code gets 500 + a random 0..24, drawn once at creation by
--     src/lib/agency/invite-policy.ts. The real number is stored and enforced
--     here, and never sent to a client (the panel says "at least 500").
--   * redeem_agency_invite() adds one condition to its single UPDATE:
--     ("useLimit" IS NULL OR "usedCount" < "useLimit"). The UPDATE takes the row
--     lock and re-checks its WHERE clause under READ COMMITTED, so two
--     registrations racing for the last use cannot both win.
--   * note_agency_invite_rejection() files a refusal of a used-up code as
--     reason 'exhausted' (under the agency, as the other reasons).
--   * CHECKs: "useLimit" > 0, and "usedCount" <= "useLimit" where there is one.
--
-- Why a NEW column and not the retired "maxUses": old rows carry old limits
-- (some are used past them). Reading "maxUses" again would shut codes that
-- agencies use today (TASK-MUM4WVYLSH9IT). "maxUses" stays retired and unread.
--
-- Trade-off: a limit brings back a refusal that means "used up" - the probing
-- channel TASK-MUM4WVYLSH9IT closed (crw-fb TASK-MUM3TMP8HU76G Ö-1). Who decided
-- what: the use limit and its 500 are the autopilot default of K-577141 (the owner
-- did not answer); the hidden 0..24 spread is the owner's decision K-577268. The spread
-- narrows the channel only while a code is not full: an agency that fills its own code
-- learns the limit exactly (patron decision A, crw-fb FO-392-crw-fb-2.md B-3; the
-- remaining risk is in invite-policy.ts and asked to the lawyer). See docs/agent-results/FO-392-se-fb.md and FO-392-se-fb-2.md.
--
-- RLS: no new table; "AgencyInviteCode" keeps tenant_isolation. The functions
-- keep their signature, SECURITY DEFINER, SET clauses and grants.
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded constraints, CREATE OR REPLACE.
-- Rollback: agency-invite-use-limit.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AgencyInviteCode" ADD COLUMN IF NOT EXISTS "useLimit" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyInviteCode_useLimit_positive'
                   AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_useLimit_positive"
      CHECK ("useLimit" IS NULL OR "useLimit" > 0);
  END IF;
  -- Second line behind the UPDATE's WHERE clause: a writer that bypasses the
  -- function still cannot push the counter past a limit.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyInviteCode_usedCount_within_useLimit'
                   AND conrelid = '"AgencyInviteCode"'::regclass) THEN
    ALTER TABLE "AgencyInviteCode" ADD CONSTRAINT "AgencyInviteCode_usedCount_within_useLimit"
      CHECK ("useLimit" IS NULL OR "usedCount" <= "useLimit");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- redeem_agency_invite(code_hash): agency-invite-no-max-uses.sql plus the limit.
-- note_agency_invite_rejection(code_hash): same file plus the 'exhausted' reason.
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
     AND (c."useLimit" IS NULL OR c."usedCount" < c."useLimit")
     AND a."id" = c."tenantId"
     AND a."kind" = 'AGENCY'
     AND a."deletedAt" IS NULL
  RETURNING c."tenantId" INTO agency;

  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
  RETURN agency;
END
$fn$;

COMMENT ON FUNCTION public.redeem_agency_invite(text) IS
  'Uses an agency invite code (atomically) and returns the agency tenant id, or NULL for any unusable code: revoked, expired, over its useLimit (NULL = unlimited, legacy), unknown, agency inactive. Never returns a row. TASK-MULRQJQYM0NAM, TASK-MUM4WVYLSH9IT, FO-392.';

REVOKE ALL ON FUNCTION public.redeem_agency_invite(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_agency_invite(text) TO fabrika_app';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- note_agency_invite_rejection(code_hash): the body of
-- fix-agency-invite-rejection-audit.sql WITH an added 'exhausted' branch.
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
             WHEN c."useLimit" IS NOT NULL AND c."usedCount" >= c."useLimit" THEN 'exhausted'
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
  'Records one refused invite-code attempt: under the agency (reason + code id) when the code exists, else as a count on one platform-only SystemAlert. Never the code, hash or person. Reason exhausted only for a code with a useLimit. TASK-MULRQJQYM0NAM, TASK-MULU7GVFBTRXX, TASK-MUM4WVYLSH9IT, FO-392.';

REVOKE ALL ON FUNCTION public.note_agency_invite_rejection(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.note_agency_invite_rejection(text) TO fabrika_app';
  END IF;
END $$;

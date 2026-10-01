-- ─────────────────────────────────────────────────────────────────────────────
-- fix-agency-invite-rejection-audit.sql — TASK-MULU7GVFBTRXX (K-6)
--
-- Purpose: a refused invite code must never leave a row a tenant can read.
--
-- add-agency-invite-code.sql filed a refusal for a code nobody has as an
-- AuditEvent with "tenantId" NULL. AuditEvent's policy is `tenant_or_shared`
-- ("tenantId" IS NULL OR "tenantId" = app.tenant_id, see
-- auditevent-tenant-or-shared.sql), so every tenant could read those rows.
--
-- After this file:
--   * a code that exists (expired, exhausted, revoked, agency inactive, lost
--     race) is filed as before under the AGENCY's tenant, and now also carries
--     the code's row id, so the agency's B2 dashboard can say which of its codes
--     was tried. Never the code, never its hash, never who tried.
--   * a code nobody has writes NO AuditEvent. It is counted in ONE open
--     SystemAlert row (level info, source agency.invite, dedupe key
--     agency.invite.rejected.unknown), in the same shape recordAlert() folds
--     repeats into (src/lib/observability/system-alert.ts): alertRepeatCount
--     and alertLastSeenAt in meta. SystemAlert has no tenantId and is read only
--     at /[locale]/admin/alerts, behind the platform-admin check. A burst of
--     repeats there is a guessing run. Also RAISE LOG, for the server log.
--
-- Idempotent: CREATE OR REPLACE with the same signature, owner, grants and
-- SET clauses as before. Running it twice changes nothing.
--
-- Rollback: fix-agency-invite-rejection-audit.down.sql restores the body from
-- add-agency-invite-code.sql. Neither file deletes rows.
-- ─────────────────────────────────────────────────────────────────────────────

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
  'Records one refused invite-code attempt: under the agency (reason + code id) when the code exists, else as a count on one platform-only SystemAlert. Never the code, hash or person. TASK-MULRQJQYM0NAM, TASK-MULU7GVFBTRXX.';

REVOKE ALL ON FUNCTION public.note_agency_invite_rejection(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.note_agency_invite_rejection(text) TO fabrika_app';
  END IF;
END $$;

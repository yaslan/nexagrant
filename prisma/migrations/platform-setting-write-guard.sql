-- ─────────────────────────────────────────────────────────────────────────────
-- platform-setting-write-guard.sql — FO-65 F2 / TASK-MVL3LMW9R7S5E
--
-- Purpose: the app role fabrika_app could UPDATE PlatformSetting, so any code
-- path with the app connection could switch the partner-search ingestor on.
-- Now the app role reads the table and nothing else, and cannot call the
-- writer either (PR #163 review, crw-fb B1): set_platform_setting() is EXECUTE
-- for its owner only, so a flag flip needs the owner connection, not the app's.
-- The writer takes the acting admin's User id, refuses a NULL/blank one or one
-- that is not a live platform admin, and writes the row and an AuditEvent in the
-- same statement's transaction.
--
-- RLS: PlatformSetting is policy-less on purpose (SYSTEM_WIDE in
-- scripts/rls-models.ts). AuditEvent is FORCE RLS and its NULL-tenant rows open
-- only under system_scope, so the function turns app.system_scope on for its own
-- body (owner path of system_scope_open(), like agency_funnel_counts) and puts
-- the old value back. No enter_system_scope seal is needed.
--
-- Re-run caveat: prisma/rls-app-role.sql grants DML on ALL TABLES to fabrika_app
-- (its step 3). Its step 3b repeats the PlatformSetting REVOKE right after, so
-- re-running it does not undo this. It grants no EXECUTE on functions.
--
-- Idempotent: REVOKE / GRANT / CREATE OR REPLACE. Rollback: platform-setting-write-guard.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- Owner-run writer. Only the key the flag reads is accepted, so the function
-- cannot be used as a general settings door.
CREATE OR REPLACE FUNCTION public.set_platform_setting(p_key text, p_value jsonb, p_actor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- In place of a function-level SET app.system_scope (Supabase: no SET ON PARAMETER, TASK-MUOG51GJ3PUOG).
  scope_was text := current_setting('app.system_scope', true);
BEGIN
  IF p_key IS DISTINCT FROM 'partner_search_ingestion_enabled' THEN
    RAISE EXCEPTION 'set_platform_setting: unknown key %', p_key USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'set_platform_setting: % takes a boolean', p_key USING ERRCODE = '22023';
  END IF;
  -- The audit row names a real admin, never free text (crw-fb B1).
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'set_platform_setting: actor is required' USING ERRCODE = '22004';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" WHERE "id" = p_actor AND "isPlatformAdmin" AND "deletedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'set_platform_setting: actor % is not a platform admin', p_actor USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.system_scope', 'on', true);
  INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
  VALUES (p_key, p_value, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "AuditEvent" ("id", "tenantId", "actorId", "type", "target", "data", "createdAt")
  VALUES (
    gen_random_uuid()::text,
    NULL,
    p_actor,
    'platform.setting.changed',
    p_key,
    jsonb_build_object('value', p_value),
    CURRENT_TIMESTAMP
  );
  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
END
$fn$;

-- Owner only: no EXECUTE for PUBLIC, and none for the app role (an earlier
-- version of this file granted it; the REVOKE below takes it back on re-run).
REVOKE ALL ON FUNCTION public.set_platform_setting(text, jsonb, text) FROM PUBLIC;

-- The app role reads the table, and can neither write it nor call the writer.
-- Inside the role check: a database without fabrika_app must still migrate.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON "PlatformSetting" FROM fabrika_app';
    EXECUTE 'GRANT SELECT ON "PlatformSetting" TO fabrika_app';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_platform_setting(text, jsonb, text) FROM fabrika_app';
  END IF;
END $$;

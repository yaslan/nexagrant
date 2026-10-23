-- ─────────────────────────────────────────────────────────────────────────────
-- platform-setting-write-guard.sql — FO-65 F2 / TASK-MVL3LMW9R7S5E
--
-- Purpose: the app role fabrika_app could UPDATE PlatformSetting, so any code
-- path with the app connection could switch the partner-search ingestor on.
-- Now the app role reads the table and nothing else. The one write path is
-- set_platform_setting(), which runs as the owner, writes the row and an
-- AuditEvent in the same statement's transaction.
--
-- RLS: PlatformSetting is policy-less on purpose (SYSTEM_WIDE in
-- scripts/rls-models.ts). AuditEvent is FORCE RLS and its NULL-tenant rows open
-- only under system_scope, so the function turns app.system_scope on for its own
-- body (owner path of system_scope_open(), like agency_funnel_counts) and puts
-- the old value back. No enter_system_scope seal is needed.
--
-- Re-run caveat: prisma/rls-app-role.sql grants DML on ALL TABLES to fabrika_app.
-- It carries the same REVOKE at its end, so re-running it does not undo this.
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

REVOKE ALL ON FUNCTION public.set_platform_setting(text, jsonb, text) FROM PUBLIC;

-- The app role may call the writer, and cannot write the table directly.
REVOKE INSERT, UPDATE, DELETE ON "PlatformSetting" FROM fabrika_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT SELECT ON "PlatformSetting" TO fabrika_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.set_platform_setting(text, jsonb, text) TO fabrika_app';
  END IF;
END $$;

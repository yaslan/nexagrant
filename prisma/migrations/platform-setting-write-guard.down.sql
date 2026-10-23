-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- platform-setting-write-guard.down.sql — rollback for platform-setting-write-guard.sql (FO-65 F2)
--
-- Gives fabrika_app its write rights back and drops the writer. The AuditEvent
-- rows already written stay. Nothing in the app depends on the function after this
-- step, so revert src/modules/m1/server/partner-search/flag.ts in the same step.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.set_platform_setting(text, jsonb, text);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT INSERT, UPDATE, DELETE ON "PlatformSetting" TO fabrika_app';
  END IF;
END $$;

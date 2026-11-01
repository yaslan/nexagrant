-- ─────────────────────────────────────────────────────────────────────────────
-- add-platform-setting.sql — FO-60 / TASK-MVCH2J271U5VY (global feature flags)
--
-- Purpose: one key/value row per platform-wide switch, so an operator can turn a
-- job on or off without a deploy. First user: partner_search_ingestion_enabled
-- (default OFF; the partner-search ingestor is a no-op while it is off).
--
-- Shape:
--   • PlatformSetting → global like Programme/CORDIS: no tenantId, no policy,
--     SYSTEM_WIDE in scripts/rls-models.ts. RLS is DISABLEd right after CREATE
--     (Supabase ensure_rls; CHECK 4c).
--   • The default row is inserted with ON CONFLICT DO NOTHING, so re-running the
--     file never flips a value an operator already changed.
--
-- Idempotent: safe to run twice (IF NOT EXISTS, ON CONFLICT DO NOTHING).
-- Rollback: add-platform-setting.down.sql (drops the table and its rows).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key"       TEXT NOT NULL,
  "value"     JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "PlatformSetting" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('partner_search_ingestion_enabled', 'false'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Default privileges reach only roles that existed when rls-app-role.sql last
-- ran (same reasoning as add-partner-search.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformSetting" TO fabrika_app;
  END IF;
END $$;

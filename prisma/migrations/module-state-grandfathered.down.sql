-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- module-state-grandfathered.down.sql — rollback for module-state-grandfathered.sql
--
-- Drops the trigger, its function and the column. LOSSY for the flag: which
-- tenants were grandfathered is gone. Before running it, keep the list:
--   SELECT "tenantId", "moduleId" FROM "ModuleState" WHERE "grandfathered";
-- and roll the application back in the same deploy to before FO-41, whose
-- catalogue still grants M3 on Discover — otherwise those tenants' M3 turns
-- ORPHANED. Running the forward file again re-flags from the state at that time.
--
-- Idempotent: DROP TRIGGER / FUNCTION IF EXISTS, DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS "ModuleState_grandfathered_owner_only" ON "ModuleState";
DROP FUNCTION IF EXISTS public.module_state_grandfathered_owner_only();
ALTER TABLE "ModuleState" DROP COLUMN IF EXISTS "grandfathered";

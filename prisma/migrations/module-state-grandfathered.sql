-- ─────────────────────────────────────────────────────────────────────────────
-- module-state-grandfathered.sql — TASK-MVC4JRKUKYPLU (FO-41 · modül paketleme F3)
--
-- Purpose: FO-41 moves M3 out of Discover (planId `free`) into Basic. A tenant
-- that runs M3 on Discover today would see it turn ORPHANED (switched on, no
-- longer in the plan) and lose it. `ModuleState.grandfathered = true` keeps that
-- module entitled for that tenant, in full, whatever its plan: `getEntitlements`
-- (src/lib/billing.ts) adds every grandfathered row's module to
-- `allowedModules`. The status column still decides access as before.
--
-- Backfill, once, at the moment the column is created: every M3 row that is not
-- OFF on a tenant without a live (TRIALING/ACTIVE) subscription on a plan other
-- than `free` — exactly the tenants whose M3 the new catalogue stops granting.
-- Paying tenants are not flagged: their plan still grants M3.
--
-- Who may set it: nobody but the table's owner (the migration role). A BEFORE
-- INSERT/UPDATE trigger refuses any other role (fabrika_app) writing `true`, so
-- a code path that upserts ModuleState cannot hand a tenant a module through
-- this column. Clearing it (true → false) stays allowed: it only removes access.
-- The ownership test is the one rls.sql's system_scope_open uses.
--
-- RLS: the column lives on ModuleState, which already carries tenant_isolation
-- and system_scope (prisma/rls.sql); nothing to add. The backfill runs under
-- the app.system_scope session that scripts/apply-migrations.sh opens.
--
-- Idempotent: the ADD COLUMN and the backfill sit in one DO block that runs
-- only when the column does not exist yet, so a second run changes no row
-- (a tenant that later turned M3 off, or bought Basic, is not re-flagged or
-- un-flagged). CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
--
-- Rollback: prisma/migrations/module-state-grandfathered.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'ModuleState'
       AND column_name = 'grandfathered'
  ) THEN
    ALTER TABLE "ModuleState" ADD COLUMN "grandfathered" BOOLEAN NOT NULL DEFAULT false;

    UPDATE "ModuleState" ms
       SET "grandfathered" = true
     WHERE ms."moduleId" = 'M3'
       AND ms."status" <> 'OFF'
       AND NOT EXISTS (
         SELECT 1 FROM "Subscription" s
          WHERE s."tenantId" = ms."tenantId"
            AND s."status" IN ('TRIALING', 'ACTIVE')
            AND lower(s."planId") <> 'free'
       );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.module_state_grandfathered_owner_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW."grandfathered"
     AND (TG_OP = 'INSERT' OR NOT OLD."grandfathered")
     AND NOT pg_has_role(current_user,
                         (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID),
                         'USAGE') THEN
    RAISE EXCEPTION 'ModuleState.grandfathered is set by migrations only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.module_state_grandfathered_owner_only() FROM PUBLIC;
DROP TRIGGER IF EXISTS "ModuleState_grandfathered_owner_only" ON "ModuleState";
CREATE TRIGGER "ModuleState_grandfathered_owner_only"
  BEFORE INSERT OR UPDATE OF "grandfathered" ON "ModuleState"
  FOR EACH ROW
  EXECUTE FUNCTION public.module_state_grandfathered_owner_only();

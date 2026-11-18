-- ─────────────────────────────────────────────────────────────────────────────
-- add-close-own-province-routes.sql — NG-222 (NG-215 review Bulgu 2, K-583842 = A)
--
-- Purpose: four writes take a tenant's M18 out of PILOT from INSIDE that tenant's own scope:
-- the tenant's settings (toggleModuleState), an iyzico downgrade, a Stripe downgrade and a Stripe
-- cancellation. Each of them must close the tenant's province routes in the same transaction
-- (NG-215: M18 closed ⇒ no active route names the tenant; otherwise the transfer box keeps
-- showing its name and the visitor consents to a forward that will be refused).
-- ProvinceLeadRoute opens only to 'platform-admin' and 'cross-tenant-job' (NG-175 D-1), so a
-- tenant scope cannot write it. K-583842 chose the narrow door over a scope escalation:
--
--   * no argument names a tenant: the tenant is app.tenant_id, the one withTenant() set for this
--     transaction. Unset → error (a caller bug, not a request to do nothing).
--   * it closes ONLY that tenant's active routes, and ONLY while that tenant's M18 ModuleState is
--     closed to its own people. ModuleState is read through its tenant_isolation policy (FORCE RLS
--     binds the owner too), so the read itself is tenant-scoped. The open set mirrors
--     isOpenToTenantMembers('M18', status) (src/lib/modules/state-machine.ts): PILOT only today.
--     tests/m18-own-route-close.live.test.ts pins the two against every ModuleStatus; if the state
--     machine changes, change this IF in the same PR.
--   * it locks the tenant row (FOR UPDATE) before reading the routes: the same first lock the
--     route set and the platform-admin M18 close take (NG-215 SEC Bulgu 1), so a concurrent set
--     either committed before (its route is closed here) or waits and then reads M18 closed.
--   * one "lead-route.deactivated" AuditEvent per province (tenantId NULL, platform audit), the
--     NG-215 shape plus who closed it: actor 'tenant_user' (actorId = the user) or 'billing'
--     (actorId NULL). No e-mail, no name.
--   * SECURITY DEFINER, fixed search_path. ProvinceLeadRoute is ENABLE (not FORCE) RLS, so the
--     owner writes it directly. AuditEvent is FORCE RLS and its NULL-tenant rows open only through
--     system_scope: app.system_scope is turned on for the INSERT only and put back right after,
--     the agency-invite functions' way (agency-invite-no-max-uses.sql; Supabase has no function-
--     level SET of a custom parameter). The flag alone opens nothing to fabrika_app (no seal,
--     ADR-0009); no purpose is entered, enter_system_scope / system_scope_open are not touched.
--     An error aborts the transaction (or the caller's savepoint), which also reverts the flag.
--   * EXECUTE: PUBLIC, anon, authenticated revoked; fabrika_app granted by name (NG-213).
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT. Touches no rows when applied. Additive.
-- Rollback: prisma/migrations/add-close-own-province-routes.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_own_province_routes(p_actor text, p_actor_id text)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  scope_was text := current_setting('app.system_scope', true);
  tid text := nullif(current_setting('app.tenant_id', true), '');
  m18 text;
  closed text[] := '{}';
  r record;
BEGIN
  IF tid IS NULL THEN
    RAISE EXCEPTION 'close_own_province_routes: app.tenant_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_actor IS NULL OR p_actor NOT IN ('tenant_user', 'billing')
     OR (p_actor = 'tenant_user') <> (p_actor_id IS NOT NULL) THEN
    RAISE EXCEPTION 'close_own_province_routes: actor must be tenant_user with an id or billing without one'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM 1 FROM "Tenant" WHERE "id" = tid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN closed;
  END IF;

  SELECT ms."status"::text INTO m18
    FROM "ModuleState" ms
   WHERE ms."tenantId" = tid AND ms."moduleId" = 'M18';
  -- isOpenToTenantMembers('M18', status): an unsold beta opens to its own people at PILOT only.
  IF m18 = 'PILOT' THEN
    RETURN closed;
  END IF;

  FOR r IN
    SELECT p."id", p."province"
      FROM "ProvinceLeadRoute" p
     WHERE p."targetTenantId" = tid AND p."active"
     ORDER BY p."province"
       FOR UPDATE
  LOOP
    UPDATE "ProvinceLeadRoute"
       SET "active" = false,
           "updatedBy" = p_actor_id,
           "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     WHERE "id" = r."id";

    PERFORM set_config('app.system_scope', 'on', true);
    INSERT INTO "AuditEvent" ("id", "tenantId", "actorId", "type", "target", "data")
    VALUES (gen_random_uuid()::text, NULL, p_actor_id, 'lead-route.deactivated', r."province",
            jsonb_build_object('province', r."province", 'fromTenantId', tid, 'toTenantId', NULL,
                               'reason', 'module_closed', 'moduleId', 'M18',
                               'newStatus', coalesce(m18, 'OFF'), 'actor', p_actor));
    PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);

    closed := closed || r."province";
  END LOOP;
  RETURN closed;
END
$fn$;

COMMENT ON FUNCTION public.close_own_province_routes(text, text) IS
  'NG-222 (K-583842): deactivates the active ProvinceLeadRoute rows of the app.tenant_id tenant only, and only while that tenant''s M18 is closed to its own people (not PILOT); locks the tenant row first; one lead-route.deactivated audit row per province (actor tenant_user|billing, no personal data). Takes no tenant id. Returns the provinces closed.';

REVOKE ALL ON FUNCTION public.close_own_province_routes(text, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.close_own_province_routes(text, text) TO fabrika_app';
  END IF;
END $$;
-- NG-213 D-3: Supabase's default privileges grant EXECUTE on every NEW function to anon and
-- authenticated; REVOKE ... FROM PUBLIC does not touch those grants. Closed here, before rls.sql runs.
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.close_own_province_routes(text, text) FROM %I', r);
  END LOOP;
END $$;

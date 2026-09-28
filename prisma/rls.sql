-- Fabrika RLS policies. Apply with: pnpm db:rls  (psql -f prisma/rls.sql)
-- App role must NOT have BYPASSRLS. Each request runs: SET LOCAL app.tenant_id = '<id>';
-- Tenant-scoped tables (keep in sync with schema.prisma; scripts/check-rls.ts verifies)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Membership','Workspace','TenantProfile','ModuleState','Subscription','AddOn','CreditLedger',
    'LifetimeLicence','Invoice','TenantBillingIdentity',
    'TopicMatch','SavedSearch','Opportunity','GateDecision','ConsortiumSeat','PartnerOrg','Proposal','Effort',
    'Evidence','ConceptNote','Relationship','Interaction','SeatCandidate','AiUsageLog',
    'Evaluation','Reviewer','Criterion','Score','MeetingBrief','FollowupDoc','DualApprovalStep','ApplicationPart','Invitation',
    'TtoPortfolioItem','ApiKey','ApprovalRequest','Claim','ProposalUsage','Feedback','CalendarConnection',
    'PlanAssignment','ClaimEvidenceLink','EvidenceReminder','Consent',
    'StripeEventLog','AgencyInviteCode'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- Tables with nullable tenantId: Document, Chunk, ConceptTemplate, AuditEvent.
--
-- For the first three, NULL means "platform row, visible to every tenant".
-- For AuditEvent it means "this event belongs to no tenant" — a KVKK/GDPR
-- erasure request from a user with no membership
-- (src/actions/user/request-deletion.ts). Under `tenant_isolation` that row was
-- unwritable and unreadable, because in SQL `NULL = 'x'` is NULL, not true, so
-- the audit trail for exactly those subjects was dropped silently
-- (TASK-MTU6HUB8FUHMG C-2). The DROP of tenant_isolation below removes the
-- policy AuditEvent carried until then; a permissive policy left in place would
-- OR with this one and outlive the fix in every already-migrated database.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Document','Chunk','ConceptTemplate','AuditEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_or_shared ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_or_shared ON %I
      USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- AuditEvent had FORCE from the tenant_isolation loop it just left; the shared
-- loop above does not FORCE, so re-state it here rather than let the C-2 fix
-- quietly exempt the table owner. Only AuditEvent: adding FORCE to Document /
-- Chunk / ConceptTemplate would change how seeds and importers write them, and
-- that is not this change.
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

-- The public pricing page counts lifetime licences from outside any tenant, so
-- under `tenant_isolation` it would read zero and report "no owners yet" while
-- licences existed. This function is the narrow exception: SECURITY DEFINER, no
-- arguments, and it returns a single integer — never a row, so no tenant is
-- identifiable through it. Mirrored in
-- prisma/migrations/add-lifetime-licence.sql; both are CREATE OR REPLACE with
-- the same body, so re-running either is a no-op.
CREATE OR REPLACE FUNCTION public.lifetime_licence_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$ SELECT count(*)::int FROM "LifetimeLicence" $fn$;

COMMENT ON FUNCTION public.lifetime_licence_count() IS 'Cross-tenant count for the public scarcity badge. Returns a number only — never a row.';

-- Platform tables (Plan, PlanVersion, PlanFeature): readable by anyone, never
-- writable through a tenant connection. A policy names exactly one command, and
-- an INSERT policy is expressed with WITH CHECK rather than USING, so the three
-- write commands need three policies. Platform writes run as the owning role
-- (which is not FORCEd here) — the app role fabrika_app is refused.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Plan','PlanVersion','PlanFeature'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_write ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_no_delete ON %I', t);
    EXECUTE format('CREATE POLICY platform_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY platform_no_insert ON %I FOR INSERT WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY platform_no_update ON %I FOR UPDATE USING (false)', t);
    EXECUTE format('CREATE POLICY platform_no_delete ON %I FOR DELETE USING (false)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Sanctioned cross-tenant scope (TASK-MTVTPVTEBCF5Z, slice 6).
--
-- The policies above answer "which tenant is asking". Thirty-five call sites in
-- src/** have no answer to give and are still correct: the API-key lookup that
-- DISCOVERS the tenant, the GDPR export that spans every tenant a data subject
-- belongs to, the platform-admin consoles, the cron fan-outs whose tenant set is
-- the query's OUTPUT. Every one of them is recorded, with a reason read out of
-- its own file, in scripts/tenant-bypass-baseline.json.
--
-- Under the local `fabrika` role (SUPERUSER, BYPASSRLS) they work by accident.
-- Under `fabrika_app` (NOBYPASSRLS) they return ZERO ROWS — measured, not
-- feared: 17 Membership rows across 7 tenants read back as 0. So the day the
-- app stops being BYPASSRLS is the day API-key auth, the magic-token partner
-- portal, GDPR export and the daily alert fan-out all fail silently.
--
-- This gives them a door instead of a hole:
--
--   * `system_scope` is a SEPARATE, PERMISSIVE policy. Permissive policies OR
--     together, so `tenant_isolation` is not touched, not reworded, and not
--     weakened — which also keeps every migration's copy of its wording valid
--     (scripts/rls-migrations.ts compares them byte for byte).
--   * It opens only while `app.system_scope` is 'on', and that GUC is set with
--     is_local => true, so it dies with the transaction that set it.
--   * The only way to set it is enter_system_scope(purpose), which validates the
--     purpose against a closed list and is EXECUTE-granted to the app role by
--     name. `REVOKE EXECUTE` closes the door in one statement, with no deploy.
--
-- What it is NOT: a boundary against a compromised app process. The app role can
-- call the function, so RLS remains a guard against FORGETTING to scope, not
-- against an attacker who already runs our code. A hard boundary needs a second
-- connection under a role the tenant path does not hold — see
-- docs/agent-results/TASK-MTVTPVTEBCF5Z-de-fb.md §6 (1-3-1), which is a decision
-- for a human, not for this file.
--
-- Deploy order: this is applied by `pnpm db:rls`. Code that calls
-- withSystemScope() reads zero rows until it has run, exactly like every other
-- policy change in this file.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enter_system_scope(purpose text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- The closed list is duplicated in src/lib/system-scope.ts on purpose: the
  -- application refuses an unknown purpose before the round trip, and the
  -- database refuses it again for anything that reaches it another way.
  -- tests/system-scope.live.test.ts asserts the two lists are identical.
  IF purpose IS NULL OR purpose NOT IN (
    'tenant-discovery',
    'subject-scoped',
    'platform-admin',
    'platform-aggregate',
    'cross-tenant-job'
  ) THEN
    RAISE EXCEPTION 'enter_system_scope: unknown purpose %', coalesce(purpose, '<null>')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- is_local => true: transaction-scoped. There is deliberately no
  -- exit_system_scope() — COMMIT and ROLLBACK are the exit, so a caller cannot
  -- leak the scope by forgetting to close it.
  PERFORM set_config('app.system_scope', 'on', true);
  PERFORM set_config('app.system_scope_purpose', purpose, true);
  RETURN purpose;
END
$fn$;

COMMENT ON FUNCTION public.enter_system_scope(text) IS
  'Opens the system_scope RLS policy for the current transaction only. Single entry point for the cross-tenant call sites recorded in scripts/tenant-bypass-baseline.json. REVOKE EXECUTE to close it.';

-- Nobody by default; the app role by name. Guarded because prisma/rls.sql runs
-- on databases where `pnpm db:rls-role` has not been run yet, and the grant is
-- re-asserted from prisma/rls-app-role.sql for the opposite order.
REVOKE ALL ON FUNCTION public.enter_system_scope(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.enter_system_scope(text) TO fabrika_app';
  END IF;
END $$;

-- The policy itself, over every table that already carries one of the two
-- tenant policies. Derived from pg_policies rather than a third hand-kept table
-- array: a list that can drift from the two above is a list that will.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT DISTINCT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname IN ('tenant_isolation', 'tenant_or_shared')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS system_scope ON %I', t);
    EXECUTE format($p$CREATE POLICY system_scope ON %I
      USING (current_setting('app.system_scope', true) = 'on')
      WITH CHECK (current_setting('app.system_scope', true) = 'on')$p$, t);
  END LOOP;
END $$;

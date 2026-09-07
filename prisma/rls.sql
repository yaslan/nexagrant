-- Fabrika RLS policies. Apply with: pnpm db:rls  (psql -f prisma/rls.sql)
-- App role must NOT have BYPASSRLS. Each request runs: SET LOCAL app.tenant_id = '<id>';
-- Tenant-scoped tables (keep in sync with schema.prisma; scripts/check-rls.ts verifies)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Membership','Workspace','TenantProfile','ModuleState','Subscription','AddOn','CreditLedger',
    'LifetimeLicence','Invoice',
    'TopicMatch','SavedSearch','Opportunity','GateDecision','ConsortiumSeat','PartnerOrg','Proposal','Effort',
    'Evidence','ConceptNote','Relationship','Interaction','SeatCandidate','AiUsageLog','AuditEvent',
    'Evaluation','Reviewer','Criterion','Score','MeetingBrief','FollowupDoc','ApplicationPart','Invitation',
    'TtoPortfolioItem','MarketplaceListing','ApiKey','ApprovalRequest','Claim','ProposalUsage','Feedback','CalendarConnection',
    'PlanAssignment'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- Tables with nullable tenantId (shared rows visible to all): Document, Chunk, ConceptTemplate
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Document','Chunk','ConceptTemplate'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_or_shared ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_or_shared ON %I
      USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

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

-- Fabrika RLS policies. Apply with: pnpm db:rls  (psql -f prisma/rls.sql)
-- App role must NOT have BYPASSRLS. Each request runs: SET LOCAL app.tenant_id = '<id>';
-- Tenant-scoped tables (keep in sync with schema.prisma; scripts/check-rls.ts verifies)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Membership','Workspace','TenantProfile','ModuleState','Subscription','AddOn','CreditLedger',
    'TopicMatch','SavedSearch','Opportunity','GateDecision','ConsortiumSeat','PartnerOrg','Proposal','Effort',
    'Evidence','ConceptNote','Relationship','Interaction','SeatCandidate','AiUsageLog','AuditEvent',
    'Evaluation','MeetingBrief','FollowupDoc','ApplicationPart','Invitation',
    'TtoPortfolioItem','MarketplaceListing','ApiKey','ApprovalRequest','Claim','ProposalUsage'
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

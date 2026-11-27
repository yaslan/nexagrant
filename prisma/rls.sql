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
    'PlanAssignment','ClaimEvidenceLink','Consent',
    'StripeEventLog','AgencyInviteCode','AuditEvent','Notification','PartnerSearchQuotaUsage',
    'InterregAnalysis','InterregAnalysisResult','InterregCriterionMark',
    'OrgReadiness','InternalApproval','PartnerBudgetShare',
    'ProjectIdea','DecisionLog',
    'NotificationPreference','NotificationEmailItem',
    'LeadOrganization','LeadContact','LeadMatch','Deal','DealActivity','DealTask',
    'ServicePackage','ServiceQuote','FunderRule','LeadEligibilityReport',
    'NgSubscription','NgAiQuotaHold'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- Tables with nullable tenantId: Document, Chunk, ConceptTemplate.
-- NULL means "platform row, visible to every tenant" — that is the point of it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Document','Chunk','ConceptTemplate'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_or_shared ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_or_shared ON %I
      USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

-- AuditEvent is in the strict loop above, although its tenantId is nullable
-- (TASK-MULUJ8O4JH1PF). A NULL there means "this event belongs to NO tenant" —
-- plan publish / archive / delete / visibility changes by a platform admin, and
-- a KVKK/GDPR erasure or export by a user with no membership. Under the shared
-- policy it carried from TASK-MTU6HUB8FUHMG C-2 to here, `"tenantId" IS NULL`
-- made every one of those rows readable by EVERY tenant (measured: 331 of 331
-- NULL rows, with the platform admin's actorId, visible to tenant A through
-- fabrika_app) and let any tenant INSERT a forged NULL row into the platform
-- audit log.
--
-- Under strict isolation `NULL = 'x'` is NULL, so a tenant session neither sees
-- nor writes those rows. They are written and read through the `system_scope`
-- policy below — withSystemScope() in the three erasure/export writers, in
-- plan-repository's platform writes, and at /admin/audit — which is what C-2
-- actually needed: the erasure record is kept, it is just no longer public.
-- The C-2 policy must be DROPPED, not left beside this one: permissive policies
-- OR together, so a leftover tenant_or_shared would keep the leak open.
-- Mirrored in prisma/migrations/auditevent-null-system-only.sql.
DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";

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

-- Platform tables (Plan, PlanVersion, PlanFeature; M17's assessment grids
-- InterregRubric, InterregRubricCriterion — FO-186; the NexaGrant plan catalogue
-- NgPlan, NgPlanFeature, NgPlanPrice, NgTrialPolicy — NG-57): readable by anyone, never
-- writable through a tenant connection. A policy names exactly one command, and
-- an INSERT policy is expressed with WITH CHECK rather than USING, so the three
-- write commands need three policies. Platform writes run as the owning role
-- (which is not FORCEd here) — the app role fabrika_app is refused.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Plan','PlanVersion','PlanFeature','InterregRubric','InterregRubricCriterion',
                         'NgPlan','NgPlanFeature','NgPlanPrice','NgTrialPolicy'] LOOP
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

-- The M17 rubric tables are not writable through fabrika_app at the privilege level
-- either (FO-186, se-fb D3): db:rls-role grants DML on every table, so this is
-- repeated on each run. Plan* keep their grants (out of scope here).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."InterregRubric", public."InterregRubricCriterion" FROM fabrika_app;
    -- NG-57: the NexaGrant plan catalogue, same reasoning (prices are entered by the platform as owner).
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."NgPlan", public."NgPlanFeature", public."NgPlanPrice", public."NgTrialPolicy" FROM fabrika_app;
  END IF;
END $$;

-- Policy-less platform tables (TASK-MUWDA86A7U4LK): no tenantId, no policy, RLS
-- off, on purpose — policylessSystemWide() in scripts/rls-models.ts, which
-- tests/rls-coverage.test.ts pins this list to. Supabase's `ensure_rls` event
-- trigger (platform-owned; we do not touch it) ENABLEs RLS on every new table
-- in public, and with no policy that is deny-all for fabrika_app: BlogPost read
-- 0 rows and refused every INSERT on live (06.10.2026, TASK-MUTP1R1C13GE3).
-- Only a table whose RLS is actually on is altered, so on a healthy database
-- this takes no lock and needs no ownership. The ALTER is schema-qualified like the
-- guard, so a search_path without public cannot aim it at another table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Account','AddOnCatalog','BlogPost','Call','CordisCoParticipation','CordisImportRun',
    'CordisOrganization','CordisParticipation','CordisPartnerProfile','CordisProject',
    'CordisProjectSciVoc','CordisProjectTopic','ModuleCatalog','PartnerProfileSnapshot',
    'PartnerSearchAnnouncement','PartnerSearchIngestionRun','PartnerSearchTopicStat','PicLookupBudget','PlatformSetting','Programme',
    'RawFetch','Session','SystemAlert','Tenant','Topic','TopicStat',
    'UnmatchedOrganization','User','VerificationToken'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(format('public.%I', t)) AND relrowsecurity) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Sanctioned cross-tenant scope (TASK-MTVTPVTEBCF5Z, slice 6; signed in
-- TASK-MUOGMQK3JAH4Y).
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
--   * It opens only while `app.system_scope` is 'on' AND one of two things
--     holds (system_scope_open() below):
--       1. the caller holds the privileges of the table's OWNER. The owner can
--          `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` anyway, so letting its
--          own plain `SET app.system_scope = 'on'` through gives it nothing it
--          did not have. This is the path of scripts/apply-migrations.sh (I-1,
--          TASK-MUOEGWSV8I7H0), of the SECURITY DEFINER functions that turn
--          `app.system_scope` on in their body (they run as the owner), and of the
--          go-live checks in docs/RELEASE_CHECKLIST.md.
--       2. `app.system_scope_token` carries this transaction's seal, which only
--          enter_system_scope(purpose) can compute: a SHA-256 over a secret in
--          fabrika_private.system_scope_key (no role but its owner can read
--          it), the backend pid, transaction_timestamp() and the purpose. A seal
--          copied out of an earlier transaction does not match the next one, and
--          a seal issued for one purpose does not match another (NG-187).
--
-- Why the seal: `app.system_scope` is a placeholder parameter, so it is
-- USERSET and PostgreSQL has no way to stop a role from setting it. Before
-- TASK-MUOGMQK3JAH4Y this file said "the only way to set it is
-- enter_system_scope(purpose)" and "REVOKE EXECUTE closes the door". Both were
-- wrong: fabrika_app opened every tenant's rows with a plain `SET`, `SET LOCAL`,
-- `set_config()`, `PGOPTIONS='-c app.system_scope=on'` or `options=` in its
-- connection string (measured, İNCELEME-115 Ö-1: 0 → every row). Now the GUC
-- alone opens nothing for a role that does not own the table, and
-- `REVOKE EXECUTE ON FUNCTION enter_system_scope` really does close the app's
-- door.
--
-- What it is still NOT: a boundary against a compromised app process. The app
-- role may CALL enter_system_scope — any purpose on the list — so a SQL
-- injection that can run any injected expression, even inside a SELECT subquery or CTE
-- (not necessarily a standalone statement), can open the scope. RLS stays a
-- guard against FORGETTING to scope and against forging the flag, not against
-- an attacker who runs our code. A hard boundary needs a second connection
-- under a role the tenant path does not hold — see
-- docs/agent-results/TASK-MTVTPVTEBCF5Z-de-fb.md §6 (1-3-1) and
-- docs/adr/ADR-0009-signed-system-scope.md.
--
-- One purpose is narrowed by table (FO-52, K-569554 = C): 'public-intake' is
-- the anonymous expert form, so a sealed scope with that purpose opens only
-- ExpertPreRegistration, ExpertFounderCounter (the founder-number counter
-- the same verification writes) and ExpertPreRegAttempt (the per-IP submission
-- counter the same registration writes, FO-26). Every other system_scope table stays shut to
-- it, reads and writes alike. The other five purposes are not narrowed. The
-- purpose is read from app.system_scope_purpose, which is USERSET like the
-- flag, but the seal binds it (NG-187, SEC NG-185 F-2): enter_system_scope
-- seals the purpose it was given, and system_scope_sealed() recomputes the
-- seal over the purpose the GUC holds NOW. A `SET LOCAL app.system_scope_purpose
-- = 'platform-admin'` after enter_system_scope('expert-directory') no longer
-- widens the scope; it breaks the seal and every sealed path reads 0 rows and
-- writes nothing until enter_system_scope is called again. This still guards
-- against a call site that reaches for the wrong table, not against code that
-- can call enter_system_scope('<another purpose>') — that code could open
-- everything anyway. A new table the form needs goes into the list in system_scope_open()
-- on purpose; until then a write there is an RLS error and a read is 0 rows.
--
-- The reverse direction (FO-92, FO-21 O4): the expert's personal data
-- (ExpertPreRegistration, ExpertPreRegAttempt) opens in a sealed scope only for
-- the purposes that handle it: 'public-intake' (the form), 'platform-admin' (the
-- list and CSV), 'platform-aggregate' (the seat count) and 'cross-tenant-job'
-- (the retention purge, FO-50). 'tenant-discovery' and 'subject-scoped' read 0
-- rows there and cannot write. The same USERSET limit applies: this guards
-- against a call site that reaches for the wrong table, not against code that
-- names a purpose on the list. A new purpose that must see an expert goes into
-- the list in system_scope_open() on purpose.
--
-- NG-175 (SEC NG-170 O-1, D-1): the same narrowing for the readiness lead tables.
-- PublicLead (the anonymous visitor's name, e-mail, organisation and routing
-- outcome) opens only for 'public-intake' (the form), 'platform-admin' (/admin/leads
-- and the unmatched worklist) and 'cross-tenant-job' (the forwarder and the nightly
-- purge); 'public-intake' may reach it in the first place. ProvinceLeadRoute opens
-- only for 'platform-admin' and 'cross-tenant-job'.
--
-- NG-367 Ö-3 (SEC NG-363): the cookie banner's consent record has its own purpose.
-- 'cookie-consent' opens CookieConsentRecord and nothing else; CookieConsentRecord
-- opens only for 'cookie-consent', 'platform-admin' and 'cross-tenant-job'. Until
-- NG-367 the write ran under 'public-intake', which also opened PublicLead and the
-- expert tables inside the same transaction.
-- Deploy order for that change: the code calls enter_system_scope('cookie-consent'),
-- which raises "unknown purpose" (the save answers 500) until this file has run, so
-- `pnpm db:rls` goes before the app restart, as for every change here.
--
-- Deploy order: this is applied by `pnpm db:rls`. Code that calls
-- withSystemScope() reads zero rows until it has run, exactly like every other
-- policy change in this file. The role that runs it must be allowed to create
-- a schema in the database (the owner in docs/RELEASE_CHECKLIST.md §3.1 is).
-- ---------------------------------------------------------------------------

-- The secret. Its own schema so `prisma db push` never sees it as a table to
-- drop, and so db:rls-role's `GRANT … ON ALL TABLES IN SCHEMA public` never
-- reaches it. Generated once; re-running keeps it, so seals issued by
-- in-flight transactions stay valid across a re-apply. Rotate with
-- `TRUNCATE fabrika_private.system_scope_key` and `pnpm db:rls`.
CREATE SCHEMA IF NOT EXISTS fabrika_private;
REVOKE ALL ON SCHEMA fabrika_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS fabrika_private.system_scope_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret text NOT NULL
);
REVOKE ALL ON TABLE fabrika_private.system_scope_key FROM PUBLIC;
INSERT INTO fabrika_private.system_scope_key (secret)
  VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  ON CONFLICT (singleton) DO NOTHING;

-- This transaction's seal for one purpose. Callable by nobody but its owner;
-- it is reached only through the two SECURITY DEFINER functions below. The
-- secret comes first and last, so neither a prefix nor an extension of a seal
-- is another valid seal. transaction_timestamp() is the same for every
-- statement of one transaction and different for the next one on the same
-- backend. The purpose is the one field the caller chooses, and it is the only
-- variable-length field between pid/timestamp and the closing secret, so two
-- different purposes never hash the same input (NG-187). A NULL purpose gives a
-- NULL seal, which matches nothing.
CREATE OR REPLACE FUNCTION fabrika_private.system_scope_seal(purpose text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $fn$
  SELECT encode(sha256(convert_to(
           k.secret || '|' || pg_backend_pid()::text || '|' ||
           extract(epoch FROM transaction_timestamp())::text || '|' ||
           purpose || '|' || k.secret,
           'UTF8')), 'hex')
    FROM fabrika_private.system_scope_key k
$fn$;
REVOKE ALL ON FUNCTION fabrika_private.system_scope_seal(text) FROM PUBLIC;

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
    'cross-tenant-job',
    'public-intake',
    'expert-directory',
    'cookie-consent'
  ) THEN
    RAISE EXCEPTION 'enter_system_scope: unknown purpose %', coalesce(purpose, '<null>')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- is_local => true: transaction-scoped. There is deliberately no
  -- exit_system_scope() — COMMIT and ROLLBACK are the exit, so a caller cannot
  -- leak the scope by forgetting to close it. The seal is what makes the flag
  -- count for a role that does not own the tables (system_scope_open()).
  PERFORM set_config('app.system_scope_token', fabrika_private.system_scope_seal(purpose), true);
  PERFORM set_config('app.system_scope', 'on', true);
  PERFORM set_config('app.system_scope_purpose', purpose, true);
  RETURN purpose;
END
$fn$;

COMMENT ON FUNCTION public.enter_system_scope(text) IS
  'Opens the system_scope RLS policy for the current transaction only: sets app.system_scope, app.system_scope_purpose and the transaction seal over that purpose in app.system_scope_token (NG-187: changing the purpose afterwards breaks the seal). Single entry point for the cross-tenant call sites recorded in scripts/tenant-bypass-baseline.json. REVOKE EXECUTE to close it.';

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

-- Does app.system_scope_token hold THIS transaction's seal for the purpose
-- app.system_scope_purpose holds NOW? SECURITY DEFINER because only the owner
-- can read the secret; it returns a boolean and nothing else, so every role
-- subject to the policy may call it. No argument on purpose: the policies call
-- it as system_scope_sealed(), and the purpose it checks is the very value the
-- purpose tests in system_scope_open() and the ExpertDirectoryEntry view read, so the seal
-- and the narrowing cannot disagree (NG-187).
CREATE OR REPLACE FUNCTION public.system_scope_sealed()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL RESTRICTED
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(current_setting('app.system_scope_token', true)
                    = fabrika_private.system_scope_seal(current_setting('app.system_scope_purpose', true)), false)
$fn$;

-- NG-187: the purpose-free seal is gone. Dropped only after both callers above
-- point at system_scope_seal(text); SQL function bodies are not dependency-
-- tracked, so nothing else can still name it. Idempotent.
DROP FUNCTION IF EXISTS fabrika_private.system_scope_seal();

-- The policy predicate. SECURITY INVOKER on purpose: current_user must be the
-- role running the query (inside a SECURITY DEFINER function that is the
-- function's owner, which is why the definer functions keep working).
-- 'USAGE' = holds the owner's privileges, the same test PostgreSQL applies to
-- ALTER TABLE. fabrika_app owns nothing and is a member of no role.
CREATE OR REPLACE FUNCTION public.system_scope_open(tbl regclass)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(current_setting('app.system_scope', true) = 'on', false)
     AND (pg_has_role(current_user,
                      (SELECT c.relowner FROM pg_class c WHERE c.oid = tbl),
                      'USAGE')
          OR (public.system_scope_sealed()
              -- FO-52: public-intake opens the expert form's tables only
              -- (ExpertPreRegAttempt: FO-26).
              -- to_regclass, not '…'::regclass: a table missing on this
              -- database (ExpertFounderCounter before its migration) is NULL
              -- here and simply not on the list, instead of an error in every
              -- system_scope policy. IS TRUE turns that NULL into false.
              AND (coalesce(current_setting('app.system_scope_purpose', true), '') <> 'public-intake'
                   OR (tbl IN (to_regclass('public."ExpertPreRegistration"'),
                               to_regclass('public."ExpertFounderCounter"'),
                               to_regclass('public."ExpertPreRegAttempt"'),
                               to_regclass('public."PublicLead"'))) IS TRUE)
              -- NG-367 Ö-3 (SEC NG-363): cookie-consent opens the banner's consent
              -- record and nothing else (not the expert or readiness forms' tables).
              AND (coalesce(current_setting('app.system_scope_purpose', true), '') <> 'cookie-consent'
                   OR (tbl = to_regclass('public."CookieConsentRecord"')) IS TRUE)
              -- FO-92: the expert's personal data opens only for the purposes
              -- that handle it. IS NOT TRUE: a missing table (NULL) is simply
              -- not on the list, like above.
              AND ((tbl IN (to_regclass('public."ExpertPreRegistration"'),
                            to_regclass('public."ExpertPreRegAttempt"'))) IS NOT TRUE
                   OR coalesce(current_setting('app.system_scope_purpose', true), '')
                        IN ('public-intake', 'platform-admin', 'platform-aggregate', 'cross-tenant-job'))
              -- NG-175 (SEC NG-170 O-1): the readiness visitor's personal data opens only
              -- for the form, the platform-admin lists and the forwarder/retention jobs.
              AND ((tbl = to_regclass('public."PublicLead"')) IS NOT TRUE
                   OR coalesce(current_setting('app.system_scope_purpose', true), '')
                        IN ('public-intake', 'platform-admin', 'cross-tenant-job'))
              -- NG-9: the cookie consent records (anonymous visitor id) open only for the banner's
              -- write, the platform-admin console and a retention job. NG-367 Ö-3: the write
              -- has its own purpose; public-intake no longer reaches this table.
              AND ((tbl = to_regclass('public."CookieConsentRecord"')) IS NOT TRUE
                   OR coalesce(current_setting('app.system_scope_purpose', true), '')
                        IN ('cookie-consent', 'platform-admin', 'cross-tenant-job'))
              -- NG-175 (SEC NG-170 D-1): the province -> consultancy map opens only for the
              -- platform-admin console and the lead forwarder.
              AND ((tbl = to_regclass('public."ProvinceLeadRoute"')) IS NOT TRUE
                   OR coalesce(current_setting('app.system_scope_purpose', true), '')
                        IN ('platform-admin', 'cross-tenant-job'))
              -- NG-52/NG-188: expert-directory opens no table through this policy. Its
              -- one read is the view "ExpertDirectoryEntry" below (card columns of
              -- verified and visibility-consented rows of ExpertPreRegistration).
              AND coalesce(current_setting('app.system_scope_purpose', true), '') <> 'expert-directory'))
$fn$;

COMMENT ON FUNCTION public.system_scope_open(regclass) IS
  'system_scope RLS predicate: app.system_scope is on AND (caller holds the table owner''s privileges OR app.system_scope_token is this transaction''s seal from enter_system_scope). Purpose public-intake opens only ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt and PublicLead (FO-52, FO-26, NG-175); purpose cookie-consent opens only CookieConsentRecord (NG-367); ExpertPreRegistration and ExpertPreRegAttempt open only for public-intake, platform-admin, platform-aggregate and cross-tenant-job (FO-92); PublicLead only for public-intake, platform-admin and cross-tenant-job (NG-175); CookieConsentRecord only for cookie-consent, platform-admin and cross-tenant-job (NG-9, NG-367); ProvinceLeadRoute only for platform-admin and cross-tenant-job (NG-175); expert-directory opens nothing here (NG-52; its one read is the view ExpertDirectoryEntry, NG-188). TASK-MUOGMQK3JAH4Y.';

-- The policy itself, over every table that already carries one of the two
-- tenant policies. Derived from pg_policies rather than a third hand-kept table
-- array: a list that can drift from the two above is a list that will.
-- `(SELECT …)` makes the predicate an InitPlan: evaluated once per statement,
-- not once per row.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT DISTINCT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname IN ('tenant_isolation', 'tenant_or_shared')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS system_scope ON %I', t);
    EXECUTE format($p$CREATE POLICY system_scope ON %I
      USING ((SELECT public.system_scope_open(%L::regclass)))
      WITH CHECK ((SELECT public.system_scope_open(%L::regclass)))$p$,
      t, quote_ident(t), quote_ident(t));
  END LOOP;
END $$;

-- ExpertPreRegistration (FO-45, K-562266 = A): personal data of experts, with no
-- tenant. RLS is ON and the one policy is system_scope, so fabrika_app reads and
-- writes it only inside withSystemScope(). Outside that scope it sees 0 rows and
-- refuses every write. Its purposes: 'public-intake' (registration, verification),
-- 'platform-aggregate' (seat count), 'platform-admin' (list and CSV),
-- 'cross-tenant-job' (retention purge, FO-50); system_scope_open() shuts it to the
-- other purposes (FO-92). Same policy body as the loop above. See prisma/migrations/expert-prereg-rls-mail-quota.sql.
ALTER TABLE public."ExpertPreRegistration" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_scope ON public."ExpertPreRegistration";
CREATE POLICY system_scope ON public."ExpertPreRegistration"
  USING ((SELECT public.system_scope_open('"ExpertPreRegistration"'::regclass)))
  WITH CHECK ((SELECT public.system_scope_open('"ExpertPreRegistration"'::regclass)));

-- NG-52 (TASK-MW2SU1H9BLCGV) + NG-188 (SEC NG-185 F-1b): the M8 candidate query reads
-- the expert pool as a directory, through the view "ExpertDirectoryEntry" and nothing else.
-- Until NG-188 it was a SELECT policy `expert_directory` on the base table: it filtered
-- ROWS, not columns, so inside the sealed 'expert-directory' scope fabrika_app could read
-- fullName, email, orcid, linkedinUrl, ipHash and verifyTokenHash of every listed expert
-- (NG-185 measurement). Column GRANTs on the base table are no answer: public-intake reads
-- and writes those same columns as fabrika_app. So the purpose gets its own read surface:
--
--   * the view carries only the card columns (id, founderNumber, province, isFreelancer,
--     roles, programmes, expertiseAreas, languages) and "listOrder", a row number in the
--     order M8 reads them (founderNumber, then createdAt, then id) so createdAt itself
--     never leaves the table;
--   * its WHERE is the old policy, word for word: sealed scope + purpose = 'expert-directory'
--     + status = 'verified' + "visibilityConsentAt" IS NOT NULL. It runs with the view
--     owner's rights (security_invoker off, the default), and the owner bypasses RLS on
--     ExpertPreRegistration (no FORCE), so this WHERE is the guard, not RLS. Owned by
--     anyone but the table owner the base read falls under RLS, where 'expert-directory'
--     opens nothing: 0 rows, fail closed;
--   * security_barrier: the caller's own predicates (a leaky function in its WHERE) cannot
--     run on a row before the view's WHERE has removed it;
--   * the window function makes the view not auto-updatable, so no INSERT, UPDATE or DELETE
--     can reach the base table through it as the owner, even for a role that holds the
--     write privilege (`GRANT … ON ALL TABLES` in db:rls-role covers views);
--   * fabrika_app gets SELECT and nothing else (rls-app-role.sql revokes the rest too).
--
-- And the base table no longer has the policy: 'expert-directory' opens no row of
-- ExpertPreRegistration (system_scope_open() is false for it), so the NG-183 block below
-- keeps exactly {system_scope} there with no exception. See
-- prisma/migrations/expert-directory-view.sql; rls:verify probeExpertDirectory measures it.
-- NG-206 (D-B2): copies of this file from before NG-188 create `expert_directory` on the base table
-- again; running them with `pnpm db:rls` on a database that has this view brings PII back. Do not
-- run an old rls.sql on the shared database. See docs/GATE.md.
DROP POLICY IF EXISTS expert_directory ON public."ExpertPreRegistration";
-- DROP + CREATE, not CREATE OR REPLACE: a drifted view (an extra column) cannot be
-- narrowed by OR REPLACE, so `pnpm db:rls` rebuilds it. Nothing depends on it; the
-- grants are re-applied right below.
DROP VIEW IF EXISTS public."ExpertDirectoryEntry";
CREATE VIEW public."ExpertDirectoryEntry" WITH (security_barrier = true) AS
  SELECT e.id,
         e."founderNumber",
         e.province,
         e."isFreelancer",
         e.roles,
         e.programmes,
         e."expertiseAreas",
         e.languages,
         row_number() OVER (ORDER BY e."founderNumber" ASC NULLS LAST, e."createdAt" ASC, e.id ASC) AS "listOrder"
    FROM public."ExpertPreRegistration" e
   WHERE (SELECT coalesce(current_setting('app.system_scope', true) = 'on', false)
                 AND coalesce(current_setting('app.system_scope_purpose', true), '') = 'expert-directory'
                 AND public.system_scope_sealed())
     AND e.status = 'verified'
     AND e."visibilityConsentAt" IS NOT NULL;
COMMENT ON VIEW public."ExpertDirectoryEntry" IS
  'NG-188: the M8 expert directory. Card columns only (no name, e-mail, ORCID, LinkedIn, IP or token), verified + visibility-consented rows only, and only inside a sealed enter_system_scope(''expert-directory''). Not updatable. fabrika_app: SELECT only.';
REVOKE ALL ON public."ExpertDirectoryEntry" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    REVOKE ALL ON public."ExpertDirectoryEntry" FROM fabrika_app;
    GRANT SELECT ON public."ExpertDirectoryEntry" TO fabrika_app;
  END IF;
END $$;

-- ExpertPreRegAttempt (FO-26, TASK-MVBLYRLP9ID93): the per-IP submission counter of the
-- same pre-registration (HMAC of an IP, pseudonymous personal data). Same standing and
-- same policy as ExpertPreRegistration: written and counted only inside
-- withSystemScope('public-intake'), which system_scope_open() opens for it. Skipped
-- on a database whose chain has not created the table yet; the migration has the
-- same block. See prisma/migrations/add-expert-pre-reg-attempt.sql.
DO $$
BEGIN
  IF to_regclass('public."ExpertPreRegAttempt"') IS NOT NULL THEN
    ALTER TABLE public."ExpertPreRegAttempt" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."ExpertPreRegAttempt";
    CREATE POLICY system_scope ON public."ExpertPreRegAttempt"
      USING ((SELECT public.system_scope_open('"ExpertPreRegAttempt"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ExpertPreRegAttempt"'::regclass)));
  END IF;
END $$;

-- CookieConsentRecord (NG-9): one row per saved cookie choice (anonymous visitor id,
-- categories, policy version, time). Same standing as ExpertPreRegAttempt: written only
-- inside withSystemScope('cookie-consent') (src/lib/cookie-consent-record.ts; its own
-- purpose since NG-367 Ö-3, 'public-intake' before), which system_scope_open() opens for it. Skipped on a database whose chain has not created
-- the table yet; prisma/migrations/add-cookie-consent-record.sql has the same block.
DO $$
BEGIN
  IF to_regclass('public."CookieConsentRecord"') IS NOT NULL THEN
    ALTER TABLE public."CookieConsentRecord" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."CookieConsentRecord";
    CREATE POLICY system_scope ON public."CookieConsentRecord"
      USING ((SELECT public.system_scope_open('"CookieConsentRecord"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"CookieConsentRecord"'::regclass)));
  END IF;
END $$;

-- ExpertFounderCounter (FO-50, K-568932 = A): the one-row founder-number counter of
-- the table above, so a purged row never frees its number. No personal data; the
-- same policy and purposes ('public-intake' verify, 'platform-aggregate' seats,
-- 'cross-tenant-job' purge). See prisma/migrations/add-expert-founder-counter.sql.
-- Guarded: a database built before that migration has no table yet.
DO $$
BEGIN
  IF to_regclass('public."ExpertFounderCounter"') IS NOT NULL THEN
    ALTER TABLE public."ExpertFounderCounter" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."ExpertFounderCounter";
    CREATE POLICY system_scope ON public."ExpertFounderCounter"
      USING ((SELECT public.system_scope_open('"ExpertFounderCounter"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ExpertFounderCounter"'::regclass)));
    -- Never emptied by the app role (crw-fb Ö-1); db:rls-role grants DELETE on every table.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
      REVOKE DELETE, TRUNCATE ON public."ExpertFounderCounter" FROM fabrika_app;
    END IF;
  END IF;
END $$;

-- ProvinceLeadRoute (NG-167): province -> consultancy tenant map for readiness leads. Platform data
-- managed by the platform admin; a tenant (even the target) reads 0 rows. Same policy as above.
-- See prisma/migrations/add-province-lead-route.sql. Guarded: older databases have no table yet.
DO $$
BEGIN
  IF to_regclass('public."ProvinceLeadRoute"') IS NOT NULL THEN
    ALTER TABLE public."ProvinceLeadRoute" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."ProvinceLeadRoute";
    CREATE POLICY system_scope ON public."ProvinceLeadRoute"
      USING ((SELECT public.system_scope_open('"ProvinceLeadRoute"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ProvinceLeadRoute"'::regclass)));
  END IF;
END $$;

-- PublicLead (NG-175, SEC NG-170 O-1): the contact request of an anonymous readiness visitor
-- (name, e-mail, organisation, routedTenantId). No tenant; until NG-175 it had no RLS and a
-- tenant session read every row. RLS ON + FORCE, one policy system_scope: fabrika_app reaches
-- it only inside withSystemScope ('public-intake' form, 'platform-admin' lists,
-- 'cross-tenant-job' forwarder and purge). FORCE holds the policy on the owner too (the owner
-- path of system_scope_open still needs app.system_scope = 'on', which apply-migrations.sh sets).
-- See prisma/migrations/public-lead-rls.sql. Guarded like the blocks above.
DO $$
BEGIN
  IF to_regclass('public."PublicLead"') IS NOT NULL THEN
    ALTER TABLE public."PublicLead" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public."PublicLead" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON public."PublicLead";
    CREATE POLICY system_scope ON public."PublicLead"
      USING ((SELECT public.system_scope_open('"PublicLead"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"PublicLead"'::regclass)));
  END IF;
END $$;

-- NG-183 (NG-175 review Düşük-1): on the system_scope tables above (system_scope policy,
-- no tenant policy) system_scope is the ONLY policy. Policies are permissive and OR
-- together, so a stray one — even FOR SELECT USING (true) — would open the personal data
-- that system_scope keeps shut. The blocks above only replace system_scope itself; this
-- drops every other policy on those tables, so `pnpm db:rls` restores the set to
-- {system_scope}. Tenant tables are not touched. `pnpm rls:verify` fails on the same set.
-- No exception any more: NG-52's expert_directory policy on ExpertPreRegistration was
-- replaced by the view "ExpertDirectoryEntry" (NG-188), so a policy of that name is now
-- dropped like any other stray one.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.policyname <> 'system_scope'
       AND p.tablename IN (
             SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'system_scope'
             EXCEPT
             SELECT tablename FROM pg_policies
              WHERE schemaname = 'public' AND policyname IN ('tenant_isolation', 'tenant_or_shared'))
  LOOP
    RAISE NOTICE 'db:rls: dropping stray policy % on system_scope table %', r.policyname, r.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- No function of this schema is callable through Supabase's Data API roles
-- (TASK-MUOG51GJ3PUOG R-S2, crw2-fb Ö-2). The policies above call
-- system_scope_open/system_scope_sealed as the querying role, and the pricing
-- page calls lifetime_licence_count() as fabrika_app: PUBLIC loses EXECUTE on
-- the three and fabrika_app gets it by name. `anon`/`authenticated` exist only
-- on Supabase, whose default privileges for `postgres` grant them EXECUTE on
-- every new function; revoked here from every function the running role owns
-- in public. Mirrored in prisma/migrations/revoke-api-role-function-execute.sql
-- (same block; the chain runs before this file, when system_scope_* may not
-- exist yet). `pnpm rls:verify` fails while any of them is still callable.
DO $$
DECLARE
  f regprocedure;
  r text;
BEGIN
  -- 1. The three without a PUBLIC revoke: PUBLIC out, the app role in by name.
  --    close_own_province_routes (NG-222, add-close-own-province-routes.sql) is re-asserted here
  --    too: its migration revokes PUBLIC itself, but it is a SECURITY DEFINER writer, so every
  --    db:rls run puts its grant back to "fabrika_app only" (rls:verify checks it).
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lifetime_licence_count', 'system_scope_sealed', 'system_scope_open', 'close_own_province_routes')
       AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO fabrika_app', f);
    END IF;
  END LOOP;

  -- 2. Supabase's API roles: nothing this role owns in public.
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    FOR f IN
      SELECT p.oid::regprocedure
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_has_role(current_user, p.proowner, 'USAGE')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
    END LOOP;
  END LOOP;
END $$;

-- Fabrika: RLS-subject application role (fabrika_app).
--
-- Why this exists: the local `fabrika` role is SUPERUSER + BYPASSRLS, so the 36
-- tenant_isolation policies installed by prisma/rls.sql are never evaluated
-- locally. Any "RLS works" claim made through that role is meaningless. This
-- script adds a *separate* login role that is genuinely subject to the policies,
-- so tenant isolation can be measured instead of assumed.
--
-- Scope note: this does NOT change DATABASE_URL. It is wired up as
-- DATABASE_URL_RLS_TEST and used by tests/rls.spec.ts. Switching the app's main
-- connection to this role is a separate, later task.
--
-- The password is never stored in this file. It is read from the GUC
-- `fabrika.app_password`, which the caller sets in the same session:
--
--   psql "$DATABASE_URL" \
--     -c "select set_config('fabrika.app_password', 'the-password', false)" \
--     -f prisma/rls-app-role.sql
--
-- or, preferred:  pnpm db:rls-role     (scripts/setup-rls-role.ts)
--
-- Rollback: prisma/rls-app-role-rollback.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  app_role   text := 'fabrika_app';
  app_pw     text := current_setting('fabrika.app_password', true);
  keep_pw    boolean := coalesce(current_setting('fabrika.app_password_keep', true), '') = 'on';
  owner_role text;
  fn         regprocedure;
BEGIN
  -- 1. Role, idempotently. NOSUPERUSER + NOBYPASSRLS is the whole point.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    IF app_pw IS NULL OR app_pw = '' THEN
      RAISE EXCEPTION
        'fabrika.app_password is not set. Run: select set_config(''fabrika.app_password'', ''<pw>'', false); before this script.';
    END IF;
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
      app_role, app_pw
    );
    RAISE NOTICE 'created role %', app_role;
  ELSIF keep_pw THEN
    -- Keep mode (scripts/setup-rls-role.ts): attributes only, the password is
    -- owned by the .env that created the role and must not be rewritten here.
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
      app_role
    );
    RAISE NOTICE 'role % already existed; password kept, grants re-applied', app_role;
  ELSE
    -- Without the GUC this branch would send PASSWORD NULL and silently remove
    -- the shared password (TASK-MVNMZ521MJ3AD B2). Refuse instead.
    IF app_pw IS NULL OR app_pw = '' THEN
      RAISE EXCEPTION
        'fabrika.app_password is not set. Role % already exists; set the password or run with the keep flag (pnpm db:rls-role). Password left unchanged.', app_role;
    END IF;
    -- Re-assert the attributes and rotate the password. Never widens privileges.
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
      app_role, app_pw
    );
    RAISE NOTICE 'role % already existed; attributes re-asserted', app_role;
  END IF;

  -- 2. Connect + schema access.
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);

  -- 3. DML on everything that exists today. No DDL, no TRUNCATE: an RLS-subject
  --    app role has no business reshaping or emptying tables.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
  --    Except DELETE on the founder-number counter: it only goes up, and a deleted
  --    row would let a purged founder number be handed out again (FO-50, crw-fb Ö-1).
  IF to_regclass('public."ExpertFounderCounter"') IS NOT NULL THEN
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public."ExpertFounderCounter" FROM %I', app_role);
  END IF;
  --     Same for the PIC question's daily budget: a deleted day would reset the count (FO-389).
  IF to_regclass('public."PicLookupBudget"') IS NOT NULL THEN
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public."PicLookupBudget" FROM %I', app_role);
  END IF;
  -- 3b. PlatformSetting is written only by set_platform_setting() (platform-setting-
  --     write-guard.sql, FO-65 F2). Step 3 above would grant DML again on a re-run.
  IF to_regclass('public."PlatformSetting"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON "PlatformSetting" FROM %I', app_role);
  END IF;
  -- 3c. The M17 rubric tables are platform reference data, written only by the seed
  --     as owner (FO-186, se-fb D3). The platform_no_* policies refuse a write too;
  --     this takes the privilege away so the refusal does not rest on policy alone.
  IF to_regclass('public."InterregRubric"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "InterregRubric" FROM %I', app_role);
  END IF;
  IF to_regclass('public."InterregRubricCriterion"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "InterregRubricCriterion" FROM %I', app_role);
  END IF;
  -- 3c'. NG-57: the NexaGrant plan catalogue, same reasoning as 3c.
  IF to_regclass('public."NgPlan"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "NgPlan", "NgPlanFeature", "NgPlanPrice", "NgTrialPolicy" FROM %I', app_role);
  END IF;

  -- 3d. The audit trail is append-only for the app (NG-40, auditevent-immutable.sql):
  --     SELECT and INSERT only. Erasure detaches an actor through audit_detach_actor().
  IF to_regclass('public."AuditEvent"') IS NOT NULL THEN
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public."AuditEvent" FROM %I', app_role);
  END IF;

  -- 3e. The M8 expert directory view is read-only (NG-188, prisma/rls.sql): step 3's
  --     ALL TABLES covers views too. The view is not updatable anyway; this keeps the
  --     privilege at SELECT so that does not rest on the view's shape alone.
  IF to_regclass('public."ExpertDirectoryEntry"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."ExpertDirectoryEntry" FROM %I', app_role);
  END IF;

  -- 3f. The record of an agency report destruction is not rewritable by the app (NG-341,
  --     add-agency-report-deletion-log.sql): SELECT only. Rows are written by
  --     agency_report_purge() (SECURITY DEFINER), which also deletes the reports.
  IF to_regclass('public."AgencyReportDeletionLog"') IS NOT NULL THEN
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."AgencyReportDeletionLog" FROM %I', app_role);
  END IF;
  IF to_regprocedure('public.agency_report_purge(text, text, timestamptz)') IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.agency_report_purge(text, text, timestamptz) TO %I', app_role);
  END IF;
  -- The 3-year prune of those records (NG-345, add-agency-report-deletion-log-no-cascade.sql).
  IF to_regprocedure('public.agency_report_deletion_log_prune(text, timestamptz)') IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.agency_report_deletion_log_prune(text, timestamptz) TO %I', app_role);
  END IF;

  -- 4. And on everything created later, per owning role. Prisma migrations run
  --    as the owner role (fabrika_owner on the VPS; fabrika locally). Default
  --    privileges are recorded per grantor. Only roles the caller is a member of
  --    are touched: ALTER DEFAULT PRIVILEGES FOR ROLE <other> is a superuser-only
  --    act, so a non-superuser owner fails here unless it skips the superuser role.
  FOR owner_role IN
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('fabrika', 'fabrika_migrate', 'fabrika_owner')
       AND pg_has_role(current_user, rolname, 'MEMBER')
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      owner_role, app_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
      owner_role, app_role
    );
  END LOOP;

  -- 5. The functions the RLS policies and the pricing page call as this role.
  --    PUBLIC has no EXECUTE on them (revoke-api-role-function-execute.sql);
  --    granted there and in rls.sql too, here for a role created after both.
  --    province_transfer_org_name (NG-179, add-province-transfer-org-name.sql): the
  --    readiness form's transfer box reads the province's organisation NAME through it.
  --    province_transfer_org (NG-204, add-public-lead-transfer-recipient.sql): the submit binds
  --    the transfer consent to that organisation's id (server side only).
  --    close_own_province_routes (NG-222, add-close-own-province-routes.sql): a tenant's own
  --    M18 close (settings, billing) deactivates that tenant's province routes.
  FOR fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lifetime_licence_count', 'system_scope_sealed', 'system_scope_open', 'province_transfer_org_name', 'province_transfer_org', 'close_own_province_routes')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn, app_role);
  END LOOP;
END $$;

-- 6. Proof, printed by the script itself: the role must be neither superuser
--    nor bypassrls, or every downstream RLS assertion is worthless.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'fabrika_app';

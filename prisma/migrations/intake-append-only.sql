-- ─────────────────────────────────────────────────────────────────────────────
-- intake-append-only.sql — NG-243 (NG-9 review Ö-1) · the anonymous intake tables are
-- append-only for the intake purposes
--
-- Purpose: CookieConsentRecord ('cookie-consent'), PublicLead, ExpertPreRegAttempt and
-- ExpertPreRegistration ('public-intake') carry one FOR ALL policy, system_scope, so a sealed
-- intake scope could also UPDATE and DELETE their rows. Two RESTRICTIVE policies per table
-- (intake_no_update, intake_no_delete) shut that; restrictive policies only narrow. Under the
-- intake purposes an UPDATE or DELETE touches 0 rows, except a PENDING ExpertPreRegistration
-- (re-issue, verify, rollback of a failed mail) and ExpertPreRegAttempt rows older than 24 hours
-- (register.ts's cleanup). platform-admin, cross-tenant-job (forwarder, retention purges) and the
-- owner path are unchanged. Full reasoning: the NG-243 block of prisma/rls.sql.
--
-- Same source: the DO block below is prisma/rls.sql's NG-243 block, byte for byte
-- (tests/rls-coverage.test.ts compares them). rls.sql re-creates it on every `pnpm db:rls`; this
-- file closes the gap until it runs. No dependency on system_scope_open(): the predicates read
-- only app.system_scope_purpose and the row. A table not created yet is skipped.
-- Deploy: any order with the code (the code never updates or deletes under these purposes beyond
-- the two exceptions). Idempotent: DROP POLICY IF EXISTS before each CREATE. No row is touched.
-- Rollback: prisma/migrations/intake-append-only.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public."CookieConsentRecord"') IS NOT NULL THEN
    DROP POLICY IF EXISTS intake_no_update ON public."CookieConsentRecord";
    CREATE POLICY intake_no_update ON public."CookieConsentRecord" AS RESTRICTIVE FOR UPDATE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent')))
      WITH CHECK (true);
    DROP POLICY IF EXISTS intake_no_delete ON public."CookieConsentRecord";
    CREATE POLICY intake_no_delete ON public."CookieConsentRecord" AS RESTRICTIVE FOR DELETE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent')));
  END IF;
  IF to_regclass('public."PublicLead"') IS NOT NULL THEN
    DROP POLICY IF EXISTS intake_no_update ON public."PublicLead";
    CREATE POLICY intake_no_update ON public."PublicLead" AS RESTRICTIVE FOR UPDATE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent')))
      WITH CHECK (true);
    DROP POLICY IF EXISTS intake_no_delete ON public."PublicLead";
    CREATE POLICY intake_no_delete ON public."PublicLead" AS RESTRICTIVE FOR DELETE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent')));
  END IF;
  IF to_regclass('public."ExpertPreRegAttempt"') IS NOT NULL THEN
    DROP POLICY IF EXISTS intake_no_update ON public."ExpertPreRegAttempt";
    CREATE POLICY intake_no_update ON public."ExpertPreRegAttempt" AS RESTRICTIVE FOR UPDATE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent')))
      WITH CHECK (true);
    DROP POLICY IF EXISTS intake_no_delete ON public."ExpertPreRegAttempt";
    CREATE POLICY intake_no_delete ON public."ExpertPreRegAttempt" AS RESTRICTIVE FOR DELETE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent'))
             OR "createdAt" < now() - interval '24 hours');
  END IF;
  IF to_regclass('public."ExpertPreRegistration"') IS NOT NULL THEN
    DROP POLICY IF EXISTS intake_no_update ON public."ExpertPreRegistration";
    CREATE POLICY intake_no_update ON public."ExpertPreRegistration" AS RESTRICTIVE FOR UPDATE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent'))
             OR (status = 'pending' AND "emailVerifiedAt" IS NULL))
      WITH CHECK ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent'))
             OR (status = 'pending' AND "emailVerifiedAt" IS NULL)
             OR (status = 'verified' AND "emailVerifiedAt" IS NOT NULL));
    DROP POLICY IF EXISTS intake_no_delete ON public."ExpertPreRegistration";
    CREATE POLICY intake_no_delete ON public."ExpertPreRegistration" AS RESTRICTIVE FOR DELETE
      USING ((SELECT coalesce(current_setting('app.system_scope_purpose', true), '') NOT IN ('public-intake', 'cookie-consent'))
             OR (status = 'pending' AND "emailVerifiedAt" IS NULL));
  END IF;
END $$;

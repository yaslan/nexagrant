-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- intake-append-only.down.sql — rollback for intake-append-only.sql (NG-243)
--
-- Restores the state before NG-243: the four intake tables carry system_scope alone, so the
-- intake purposes may UPDATE and DELETE again. Roll prisma/rls.sql back in the same deploy: the
-- NG-243 rls.sql re-creates the two policies on the next `pnpm db:rls`. No row is touched.
-- Idempotent: DROP POLICY IF EXISTS; a missing table is skipped.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['CookieConsentRecord', 'PublicLead', 'ExpertPreRegAttempt', 'ExpertPreRegistration'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS intake_no_update ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS intake_no_delete ON public.%I', t);
    END IF;
  END LOOP;
END $$;

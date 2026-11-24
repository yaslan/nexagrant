-- ─────────────────────────────────────────────────────────────────────────────
-- add-agency-report-deletion-log.sql — NG-341 (HUKUK-5 5d, veri sorumlusu kararı 23.11.2026)
--
-- Purpose: agency monthly reports (AuditEvent type 'agency.report.generated') are kept 12 months
-- and destroyed together every 6 months (KVKK md.4/2-d; Yönetmelik md.11). Each destruction is
-- recorded; the records are kept at least 3 years (their own pruning is a separate job).
--
--   1. "AgencyReportDeletionLog": one row per (destruction run, agency) that removed at least one
--      report. Counts and metadata ONLY: no report content, no personal data, no actor.
--        runId        the run (cron:<tick ISO> | manual:<ISO>)
--        tenantId     the agency
--        deletedAt    when (UTC)
--        reportCount  how many reports were deleted
--        periodFrom / periodTo  the oldest and newest deleted period (YYYY-MM)
--        basis        'retention-12m'
--        cutoffAt     reports created before this moment (UTC) were deleted
--   2. public.agency_report_purge(tenant, run, cutoff): the only way the app deletes a report.
--      "AuditEvent" is append-only for fabrika_app (NG-40, auditevent-immutable.sql); this
--      SECURITY DEFINER function can do exactly one thing: delete 'agency.report.generated' rows
--      of the caller's own tenant (app.tenant_id must equal p_tenant) created before p_cutoff,
--      where p_cutoff is at least 12 months back (enforced HERE, not only in the job), and write
--      the log row in the same transaction. It cannot touch any other event type or tenant.
--   3. fabrika_app may only SELECT the log: the record of a deletion is not rewritable by the
--      app. Inserts go through the function. Repeated in prisma/rls-app-role.sql step 3f.
--
-- RLS: strict tenant_isolation in the wording of prisma/rls.sql, in this same file
-- (scripts/rls-migrations.ts). FORCE applies to the owner too, so the function's DELETE and
-- INSERT pass only because app.tenant_id is the agency's.
--
-- Idempotency: table/indexes IF NOT EXISTS, FK guarded by pg_constraint, CREATE OR REPLACE,
-- policy DROP-then-CREATE, REVOKE/GRANT. A second run, or a run after `prisma db push`, changes
-- nothing. Purely ADDITIVE: no existing row or column is touched.
-- Rollback: prisma/migrations/add-agency-report-deletion-log.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AgencyReportDeletionLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportCount" INTEGER NOT NULL,
    "periodFrom" TEXT,
    "periodTo" TEXT,
    "basis" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyReportDeletionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyReportDeletionLog_runId_tenantId_key" ON "AgencyReportDeletionLog"("runId", "tenantId");
CREATE INDEX IF NOT EXISTS "AgencyReportDeletionLog_tenantId_deletedAt_idx" ON "AgencyReportDeletionLog"("tenantId", "deletedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyReportDeletionLog_tenantId_fkey') THEN
    ALTER TABLE "AgencyReportDeletionLog" ADD CONSTRAINT "AgencyReportDeletionLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS (byte-identical to prisma/rls.sql) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AgencyReportDeletionLog'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.agency_report_purge(p_tenant text, p_run text, p_cutoff timestamptz)
RETURNS TABLE (deleted integer, period_from text, period_to text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- "AuditEvent"."createdAt" is TIMESTAMP(3) holding UTC; compare in UTC whatever the session zone.
  cutoff_utc timestamp(3) := p_cutoff AT TIME ZONE 'UTC';
  n integer;
  pf text;
  pt text;
BEGIN
  IF p_tenant IS NULL OR btrim(p_tenant) = '' OR p_run IS NULL OR btrim(p_run) = '' OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'agency_report_purge: tenant, run and cutoff are required' USING ERRCODE = '22004';
  END IF;
  -- Only the agency's own session can purge its reports.
  IF p_tenant IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'agency_report_purge: tenant % is not the session tenant', p_tenant USING ERRCODE = '42501';
  END IF;
  -- The 12-month retention (NG-341) is a floor the caller cannot cut.
  IF p_cutoff > now() - interval '12 months' THEN
    RAISE EXCEPTION 'agency_report_purge: cutoff % is less than 12 months back', p_cutoff USING ERRCODE = '42501';
  END IF;

  WITH gone AS (
    DELETE FROM "AuditEvent"
     WHERE "tenantId" = p_tenant
       AND "type" = 'agency.report.generated'
       AND "createdAt" < cutoff_utc
    RETURNING "target"
  )
  SELECT count(*)::int, min("target"), max("target") INTO n, pf, pt FROM gone;

  IF n > 0 THEN
    INSERT INTO "AgencyReportDeletionLog"
      ("id", "runId", "tenantId", "deletedAt", "reportCount", "periodFrom", "periodTo", "basis", "cutoffAt")
    VALUES
      (gen_random_uuid()::text, p_run, p_tenant, now() AT TIME ZONE 'UTC', n, pf, pt, 'retention-12m', cutoff_utc)
    ON CONFLICT ("runId", "tenantId") DO UPDATE
      SET "reportCount" = "AgencyReportDeletionLog"."reportCount" + EXCLUDED."reportCount",
          "periodFrom"  = LEAST("AgencyReportDeletionLog"."periodFrom", EXCLUDED."periodFrom"),
          "periodTo"    = GREATEST("AgencyReportDeletionLog"."periodTo", EXCLUDED."periodTo"),
          "deletedAt"   = EXCLUDED."deletedAt";
  END IF;

  deleted := n;
  period_from := pf;
  period_to := pt;
  RETURN NEXT;
END
$fn$;

REVOKE ALL ON FUNCTION public.agency_report_purge(text, text, timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AgencyReportDeletionLog" FROM fabrika_app';
    EXECUTE 'GRANT SELECT ON "AgencyReportDeletionLog" TO fabrika_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agency_report_purge(text, text, timestamptz) TO fabrika_app';
  END IF;
END $$;
